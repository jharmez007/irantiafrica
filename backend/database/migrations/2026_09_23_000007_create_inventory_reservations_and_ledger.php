<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE reservation_references (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE reservations (
 id uuid PRIMARY KEY,
 reference_id uuid NOT NULL REFERENCES reservation_references(id) ON DELETE RESTRICT,
 generation integer NOT NULL CHECK(generation > 0),
 status varchar(16) NOT NULL CHECK(status IN ('ACTIVE','COMMITTED','RELEASED','EXPIRED')),
 expires_at timestamptz NOT NULL,
 closed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(reference_id, generation), UNIQUE(id, reference_id),
 CHECK(expires_at > created_at),
 CHECK((status = 'ACTIVE' AND closed_at IS NULL) OR (status <> 'ACTIVE' AND closed_at >= created_at AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX reservations_one_active ON reservations(reference_id) WHERE status = 'ACTIVE';
CREATE INDEX reservations_expiry ON reservations(expires_at, id) WHERE status = 'ACTIVE';
CREATE TABLE reservation_items (
 id uuid PRIMARY KEY,
 reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(reservation_id, variant_id), UNIQUE(id, variant_id)
);
CREATE INDEX reservation_items_variant ON reservation_items(variant_id);
CREATE TABLE inventory_movements (
 id uuid PRIMARY KEY,
 variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 reservation_item_id uuid,
 actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 operation_key varchar(255) NOT NULL UNIQUE CHECK(btrim(operation_key) <> ''),
 kind varchar(16) NOT NULL CHECK(kind IN ('OPENING','RESERVE','RELEASE','SALE','ADJUSTMENT','RESTOCK')),
 on_hand_delta integer NOT NULL,
 reserved_delta integer NOT NULL,
 on_hand_after integer NOT NULL CHECK(on_hand_after >= 0),
 reserved_after integer NOT NULL CHECK(reserved_after >= 0 AND reserved_after <= on_hand_after),
 reason varchar(500) NOT NULL CHECK(btrim(reason) <> ''),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(reservation_item_id, variant_id) REFERENCES reservation_items(id, variant_id) ON DELETE RESTRICT,
 CHECK(on_hand_delta <> 0 OR reserved_delta <> 0),
 CHECK(
  (kind = 'OPENING' AND on_hand_delta > 0 AND reserved_delta = 0 AND reservation_item_id IS NULL AND actor_user_id IS NOT NULL) OR
  (kind = 'ADJUSTMENT' AND on_hand_delta <> 0 AND reserved_delta = 0 AND reservation_item_id IS NULL AND actor_user_id IS NOT NULL) OR
  (kind = 'RESTOCK' AND on_hand_delta > 0 AND reserved_delta = 0) OR
  (kind = 'RESERVE' AND on_hand_delta = 0 AND reserved_delta > 0 AND reservation_item_id IS NOT NULL) OR
  (kind = 'RELEASE' AND on_hand_delta = 0 AND reserved_delta < 0 AND reservation_item_id IS NOT NULL) OR
  (kind = 'SALE' AND on_hand_delta < 0 AND reserved_delta = on_hand_delta AND reservation_item_id IS NOT NULL)
 )
);
CREATE INDEX inventory_movements_history ON inventory_movements(variant_id, created_at DESC, id DESC);
CREATE INDEX inventory_movements_item ON inventory_movements(reservation_item_id);
CREATE INDEX inventory_movements_actor ON inventory_movements(actor_user_id);
CREATE OR REPLACE FUNCTION inventory_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Inventory history is append-only';
END; $$;
CREATE OR REPLACE FUNCTION inventory_reservation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Reservation history cannot be deleted'; END IF;
 IF OLD.status <> 'ACTIVE' OR NEW.status NOT IN ('COMMITTED','RELEASED','EXPIRED') OR
    (NEW.id, NEW.reference_id, NEW.generation, NEW.expires_at, NEW.created_at) IS DISTINCT FROM
    (OLD.id, OLD.reference_id, OLD.generation, OLD.expires_at, OLD.created_at) THEN
  RAISE EXCEPTION 'Invalid reservation transition';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER reservations_transition BEFORE UPDATE OR DELETE ON reservations FOR EACH ROW EXECUTE FUNCTION inventory_reservation_transition();
CREATE TRIGGER reservations_no_truncate BEFORE TRUNCATE ON reservations FOR EACH STATEMENT EXECUTE FUNCTION inventory_reservation_transition();
SQL);
        foreach (['reservation_references', 'reservation_items', 'inventory_movements'] as $table) {
            DB::unprepared("CREATE TRIGGER {$table}_immutable BEFORE UPDATE OR DELETE ON {$table} FOR EACH ROW EXECUTE FUNCTION inventory_append_only(); CREATE TRIGGER {$table}_no_truncate BEFORE TRUNCATE ON {$table} FOR EACH STATEMENT EXECUTE FUNCTION inventory_append_only()");
        }
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE inventory_movements, reservation_items, reservations, reservation_references; DROP FUNCTION inventory_reservation_transition(); DROP FUNCTION inventory_append_only()');
    }
};
