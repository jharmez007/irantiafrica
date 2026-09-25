<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE inventory (
 id uuid PRIMARY KEY,
 variant_id uuid NOT NULL UNIQUE REFERENCES product_variants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand >= 0),
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand),
 low_stock_threshold integer NOT NULL DEFAULT 0 CHECK(low_stock_threshold >= 0),
 version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION protect_inventory_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.id <> OLD.id OR NEW.variant_id <> OLD.variant_id OR NEW.created_at <> OLD.created_at THEN
   RAISE EXCEPTION 'Inventory identity is immutable';
  END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Inventory balances cannot be deleted';
END; $$;
CREATE TRIGGER inventory_identity BEFORE UPDATE OR DELETE ON inventory FOR EACH ROW EXECUTE FUNCTION protect_inventory_identity();
CREATE TRIGGER inventory_no_truncate BEFORE TRUNCATE ON inventory FOR EACH STATEMENT EXECUTE FUNCTION protect_inventory_identity();
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE inventory; DROP FUNCTION protect_inventory_identity()');
    }
};
