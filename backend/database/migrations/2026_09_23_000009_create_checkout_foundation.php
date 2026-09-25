<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE checkout_configurations (
 id uuid PRIMARY KEY, version_code varchar(80) NOT NULL UNIQUE,
 effective_from timestamptz NOT NULL UNIQUE, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 development_only boolean NOT NULL, approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION checkout_config_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published checkout configuration is immutable'; END $$;
CREATE TRIGGER checkout_config_no_edit BEFORE UPDATE OR DELETE ON checkout_configurations FOR EACH ROW EXECUTE FUNCTION checkout_config_immutable();
CREATE TABLE addresses (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_name varchar(160) NOT NULL, phone varchar(32) NOT NULL,
 line1 varchar(255) NOT NULL, line2 varchar(255), city varchar(120) NOT NULL,
 state_code varchar(40) NOT NULL, locality_code varchar(120), postal_code varchar(20),
 country_code char(2) NOT NULL CHECK(country_code='NG'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user ON addresses(user_id);
CREATE TABLE checkout_sessions (
 id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 guest_token_hash char(64) UNIQUE, cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
 source_cart_id uuid NOT NULL, cart_version integer NOT NULL CHECK(cart_version>0),
 creation_key uuid NOT NULL, creation_hash char(64) NOT NULL,
 status varchar(24) NOT NULL CHECK(status IN ('DRAFT','QUOTED','RESERVED','REVIEW_REQUIRED','EXPIRED','CANCELLED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 configuration_id uuid REFERENCES checkout_configurations(id) ON DELETE RESTRICT,
 inventory_reference_id uuid UNIQUE REFERENCES reservation_references(id) ON DELETE RESTRICT,
 current_reservation_id uuid UNIQUE, reserve_key uuid, reserve_hash char(64),
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0), tax_minor bigint CHECK(tax_minor>=0),
 delivery_minor bigint CHECK(delivery_minor>=0), total_minor bigint CHECK(total_minor>0),
 currency char(3) NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 calculation jsonb, fingerprint char(64), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((user_id IS NULL) <> (guest_token_hash IS NULL)),
 CHECK(guest_token_hash IS NULL OR guest_token_hash ~ '^[0-9a-f]{64}$'),
 CHECK((inventory_reference_id IS NULL) = (current_reservation_id IS NULL)),
 CHECK((total_minor IS NULL) = (tax_minor IS NULL)),
 CHECK((total_minor IS NULL) = (delivery_minor IS NULL)),
 CHECK(total_minor IS NULL OR total_minor::numeric=subtotal_minor::numeric+tax_minor::numeric+delivery_minor::numeric),
 CHECK(status NOT IN ('QUOTED','RESERVED') OR (configuration_id IS NOT NULL AND total_minor IS NOT NULL AND fingerprint IS NOT NULL)),
 CHECK(status <> 'RESERVED' OR current_reservation_id IS NOT NULL),
 UNIQUE(source_cart_id,creation_key),
 FOREIGN KEY(current_reservation_id,inventory_reference_id) REFERENCES reservations(id,reference_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX checkout_active_cart ON checkout_sessions(source_cart_id) WHERE status IN ('DRAFT','QUOTED','RESERVED');
CREATE UNIQUE INDEX checkout_active_user ON checkout_sessions(user_id) WHERE status IN ('DRAFT','QUOTED','RESERVED');
CREATE INDEX checkout_expiry ON checkout_sessions(status,expires_at);
CREATE TABLE checkout_lines (
 id uuid PRIMARY KEY, checkout_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity>0), unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 line_subtotal_minor bigint NOT NULL CHECK(line_subtotal_minor>=0), snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 tax_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(checkout_id,variant_id),
 CHECK(line_subtotal_minor::numeric=quantity::numeric*unit_price_minor::numeric)
);
CREATE TABLE checkout_addresses (
 id uuid PRIMARY KEY, checkout_id uuid NOT NULL UNIQUE REFERENCES checkout_sessions(id) ON DELETE RESTRICT,
 email varchar(254) NOT NULL, address jsonb NOT NULL CHECK(jsonb_typeof(address)='object'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE checkout_addresses, checkout_lines, checkout_sessions, addresses, checkout_configurations; DROP FUNCTION checkout_config_immutable()');
    }
};
