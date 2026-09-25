<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE carts (
 id uuid PRIMARY KEY,
 user_id uuid REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 guest_token_hash char(64) UNIQUE,
 status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','expired','merged')),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((user_id IS NULL) <> (guest_token_hash IS NULL)),
 CHECK(guest_token_hash IS NULL OR guest_token_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX carts_active_user ON carts(user_id) WHERE status = 'active';
CREATE INDEX carts_expiry ON carts(expires_at);
CREATE INDEX carts_status_updated ON carts(status, updated_at);
CREATE TABLE cart_items (
 id uuid PRIMARY KEY,
 cart_id uuid NOT NULL REFERENCES carts(id) ON UPDATE RESTRICT ON DELETE CASCADE,
 variant_id uuid NOT NULL REFERENCES product_variants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cart_id, variant_id)
);
CREATE INDEX cart_items_variant ON cart_items(variant_id);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE cart_items, carts');
    }
};
