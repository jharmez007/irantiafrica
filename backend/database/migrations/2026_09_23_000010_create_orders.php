<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE checkout_sessions ADD COLUMN promoted_at timestamptz;
DROP INDEX checkout_active_cart;
DROP INDEX checkout_active_user;
CREATE UNIQUE INDEX checkout_active_cart ON checkout_sessions(source_cart_id) WHERE promoted_at IS NULL AND status IN ('DRAFT','QUOTED','RESERVED');
CREATE UNIQUE INDEX checkout_active_user ON checkout_sessions(user_id) WHERE promoted_at IS NULL AND status IN ('DRAFT','QUOTED','RESERVED');
CREATE TABLE orders (
 id uuid PRIMARY KEY, public_reference varchar(24) NOT NULL UNIQUE,
 checkout_id uuid NOT NULL UNIQUE REFERENCES checkout_sessions(id) ON DELETE RESTRICT,
 user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 source_cart_id uuid NOT NULL, source_cart_version integer NOT NULL CHECK(source_cart_version>0),
 inventory_reference_id uuid NOT NULL UNIQUE REFERENCES reservation_references(id) ON DELETE RESTRICT,
 current_reservation_id uuid NOT NULL UNIQUE,
 contact_email varchar(254) NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK(status IN ('PENDING_PAYMENT','CANCELLED')),
 payment_state varchar(24) NOT NULL DEFAULT 'NOT_STARTED' CHECK(payment_state='NOT_STARTED'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 currency char(3) NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),
 product_tax_minor bigint NOT NULL CHECK(product_tax_minor>=0),
 delivery_minor bigint NOT NULL CHECK(delivery_minor>=0),
 delivery_tax_minor bigint NOT NULL CHECK(delivery_tax_minor>=0),
 tax_minor bigint NOT NULL CHECK(tax_minor>=0), total_minor bigint NOT NULL CHECK(total_minor>0),
 calculation jsonb NOT NULL CHECK(jsonb_typeof(calculation)='object'),
 configuration_id uuid NOT NULL REFERENCES checkout_configurations(id) ON DELETE RESTRICT,
 fingerprint char(64) NOT NULL,
 creation_scope char(64) NOT NULL, creation_key uuid NOT NULL, creation_hash char(64) NOT NULL,
 guest_token_hash char(64), guest_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), cancelled_at timestamptz,
 UNIQUE(creation_scope,creation_key),
 FOREIGN KEY(current_reservation_id,inventory_reference_id) REFERENCES reservations(id,reference_id) ON DELETE RESTRICT,
 CHECK((user_id IS NULL) <> (guest_token_hash IS NULL)),
 CHECK((guest_token_hash IS NULL)=(guest_expires_at IS NULL)),
 CHECK(guest_token_hash IS NULL OR (guest_token_hash ~ '^[0-9a-f]{64}$' AND guest_expires_at>created_at)),
 CHECK((status='CANCELLED')=(cancelled_at IS NOT NULL)),
 CHECK(tax_minor::numeric=product_tax_minor::numeric+delivery_tax_minor::numeric),
 CHECK(total_minor::numeric=subtotal_minor::numeric+tax_minor::numeric+delivery_minor::numeric)
);
CREATE INDEX orders_customer_date ON orders(user_id,created_at DESC,id DESC);
CREATE INDEX orders_status_date ON orders(status,created_at DESC,id DESC);
CREATE TABLE order_items (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity>0), unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 line_subtotal_minor bigint NOT NULL CHECK(line_subtotal_minor>=0), tax_minor bigint NOT NULL CHECK(tax_minor>=0),
 line_total_minor bigint NOT NULL CHECK(line_total_minor>=0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), tax_snapshot jsonb NOT NULL CHECK(jsonb_typeof(tax_snapshot)='object'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,variant_id),
 CHECK(line_subtotal_minor::numeric=quantity::numeric*unit_price_minor::numeric),
 CHECK(line_total_minor::numeric=line_subtotal_minor::numeric+tax_minor::numeric)
);
CREATE TABLE order_addresses (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
 address jsonb NOT NULL CHECK(jsonb_typeof(address)='object' AND address->>'country_code'='NG'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_status_history (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 from_status varchar(24), to_status varchar(24) NOT NULL,
 actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 source varchar(24) NOT NULL CHECK(source IN ('customer','guest','owner','system')),
 reason varchar(500) NOT NULL, event varchar(32) NOT NULL CHECK(event IN ('OrderCreated','OrderCancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((from_status IS NULL AND to_status='PENDING_PAYMENT' AND event='OrderCreated') OR (from_status='PENDING_PAYMENT' AND to_status='CANCELLED' AND event='OrderCancelled')),
 UNIQUE(order_id,event)
);
CREATE INDEX order_history_date ON order_status_history(order_id,created_at,id);
CREATE OR REPLACE FUNCTION order_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Order commercial snapshots and history are immutable'; END $$;
CREATE TRIGGER order_items_immutable BEFORE UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER order_addresses_immutable BEFORE UPDATE OR DELETE ON order_addresses FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER order_history_immutable BEFORE UPDATE OR DELETE ON order_status_history FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE OR REPLACE FUNCTION order_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Orders are retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','updated_at','cancelled_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','cancelled_at']) THEN
 RAISE EXCEPTION 'Order commercial fields are immutable'; END IF;
 IF NOT (OLD.status='PENDING_PAYMENT' AND NEW.status='CANCELLED' AND NEW.version=OLD.version+1) THEN
 RAISE EXCEPTION 'Unsupported order transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER orders_controlled_update BEFORE UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION order_controlled_update();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE order_status_history, order_addresses, order_items, orders;
DROP FUNCTION order_controlled_update();
DROP FUNCTION order_append_only();
DROP INDEX checkout_active_cart;
DROP INDEX checkout_active_user;
ALTER TABLE checkout_sessions DROP COLUMN promoted_at;
CREATE UNIQUE INDEX checkout_active_cart ON checkout_sessions(source_cart_id) WHERE status IN ('DRAFT','QUOTED','RESERVED');
CREATE UNIQUE INDEX checkout_active_user ON checkout_sessions(user_id) WHERE status IN ('DRAFT','QUOTED','RESERVED');
SQL);
    }
};
