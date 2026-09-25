<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('PENDING_PAYMENT','CANCELLED','PAID','PAYMENT_REVIEW','PROCESSING','SHIPPED','DELIVERED'));
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='orders'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%paid_at%' LOOP
 EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE orders ADD CONSTRAINT orders_paid_at_check CHECK((status IN ('PAID','PROCESSING','SHIPPED','DELIVERED'))=(paid_at IS NOT NULL));
ALTER TABLE orders ADD COLUMN processing_at timestamptz;
ALTER TABLE orders ADD CONSTRAINT orders_processing_at_check CHECK((status IN ('PROCESSING','SHIPPED','DELIVERED'))=(processing_at IS NOT NULL) AND (processing_at IS NULL OR processing_at>=paid_at));
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_check;
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_source_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_source_check CHECK(source IN ('customer','guest','owner','system','staff'));
ALTER TABLE order_status_history ADD CHECK(
 (from_status IS NULL AND to_status='PENDING_PAYMENT' AND event='OrderCreated') OR
 (from_status='PENDING_PAYMENT' AND to_status='CANCELLED' AND event='OrderCancelled') OR
 (from_status='PENDING_PAYMENT' AND to_status='PAID' AND event='OrderPaid') OR
 (from_status='PENDING_PAYMENT' AND to_status='PAYMENT_REVIEW' AND event='OrderPaymentReview') OR
 (from_status='PAID' AND to_status='PROCESSING' AND event='OrderProcessingStarted') OR
 (from_status='PROCESSING' AND to_status='SHIPPED' AND event='OrderShipped') OR
 (from_status='SHIPPED' AND to_status='DELIVERED' AND event='OrderDelivered'));
CREATE OR REPLACE FUNCTION order_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Orders are retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','updated_at','cancelled_at','payment_state','paid_at','financial_hold','processing_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','cancelled_at','payment_state','paid_at','financial_hold','processing_at']) THEN RAISE EXCEPTION 'Order commercial fields are immutable'; END IF;
 IF NEW.version<>OLD.version+1 OR (OLD.financial_hold AND NOT NEW.financial_hold) OR (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at) OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN RAISE EXCEPTION 'Invalid lifecycle update'; END IF;
 IF OLD.processing_at IS NOT NULL AND NEW.processing_at IS DISTINCT FROM OLD.processing_at THEN RAISE EXCEPTION 'Processing time immutable'; END IF;
 IF NOT (NEW.status=OLD.status OR (OLD.status='PENDING_PAYMENT' AND NEW.status IN ('CANCELLED','PAID','PAYMENT_REVIEW')) OR (OLD.status='PAID' AND NEW.status='PROCESSING') OR (OLD.status='PROCESSING' AND NEW.status='SHIPPED') OR (OLD.status='SHIPPED' AND NEW.status='DELIVERED')) THEN RAISE EXCEPTION 'Unsupported order transition'; END IF;
 IF NEW.status='CANCELLED' AND OLD.status<>NEW.status AND (OLD.payment_state<>'NOT_STARTED' OR EXISTS(SELECT 1 FROM payment_attempts WHERE order_id=OLD.id)) THEN RAISE EXCEPTION 'Payment activity prevents cancellation'; END IF;
 IF NEW.status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') AND (NEW.payment_state NOT IN ('SUCCESSFUL','REQUIRES_REVIEW') OR NOT EXISTS(SELECT 1 FROM payments WHERE order_id=NEW.id AND applied_at IS NOT NULL)) THEN RAISE EXCEPTION 'Applied receipt required'; END IF;
 IF OLD.status<>NEW.status AND NEW.status IN ('PROCESSING','SHIPPED','DELIVERED') THEN
  IF NOT EXISTS(SELECT 1 FROM reservations WHERE id=NEW.current_reservation_id AND status='COMMITTED') THEN RAISE EXCEPTION 'Consumed inventory required'; END IF;
  IF NEW.status<>'DELIVERED' AND (NEW.financial_hold OR NEW.payment_state<>'SUCCESSFUL') THEN RAISE EXCEPTION 'Financial hold blocks preparation and dispatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TABLE shipments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
 provider_label varchar(160) NOT NULL CHECK(length(btrim(provider_label))>0 AND provider_label !~ '[[:cntrl:]]'),
 tracking_number varchar(160) CHECK(tracking_number IS NULL OR (length(btrim(tracking_number))>0 AND tracking_number !~ '[[:cntrl:]]')),
 tracking_url varchar(2048) CHECK(tracking_url IS NULL OR (tracking_url ~ '^https://' AND tracking_url !~ '[[:cntrl:][:space:]]')),
 status varchar(16) NOT NULL CHECK(status IN ('PREPARED','SHIPPED','DELIVERED')),
 shipped_at timestamptz, delivered_at timestamptz,
 recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operational_notes varchar(1000), delivery_evidence varchar(1000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,order_id),
 CHECK((status IN ('SHIPPED','DELIVERED'))=(shipped_at IS NOT NULL)),
 CHECK((status='DELIVERED')=(delivered_at IS NOT NULL)),
 CHECK(shipped_at IS NULL OR (tracking_number IS NOT NULL AND tracking_url IS NOT NULL AND shipped_at>=created_at)),
 CHECK(delivered_at IS NULL OR (delivered_at>=shipped_at AND length(btrim(delivery_evidence))>0)),
 CHECK((status='DELIVERED')=(delivery_evidence IS NOT NULL))
);
CREATE INDEX shipments_status_time ON shipments(status,shipped_at);
CREATE INDEX shipments_actor ON shipments(recorded_by);
CREATE TABLE shipment_status_history (
 id uuid PRIMARY KEY, shipment_id uuid NOT NULL, order_id uuid NOT NULL,
 from_status varchar(16), to_status varchar(16) NOT NULL,
 event varchar(32) NOT NULL, actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 note varchar(1000), context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shipment_id,order_id) REFERENCES shipments(id,order_id) ON DELETE RESTRICT,
 CHECK((from_status IS NULL AND to_status='PREPARED' AND event='ShipmentCreated') OR
 (from_status='PREPARED' AND to_status='PREPARED' AND event='ShipmentUpdated') OR
 (from_status='PREPARED' AND to_status='SHIPPED' AND event='OrderShipped') OR
 (from_status='SHIPPED' AND to_status='DELIVERED' AND event='OrderDelivered'))
);
CREATE INDEX shipment_history_date ON shipment_status_history(order_id,created_at,id);
CREATE INDEX shipment_history_actor ON shipment_status_history(actor_user_id);
CREATE TABLE fulfilment_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 event varchar(32) NOT NULL CHECK(event IN ('OrderProcessingStarted','ShipmentCreated','OrderShipped','OrderDelivered')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,event)
);
CREATE TRIGGER shipment_history_immutable BEFORE UPDATE OR DELETE ON shipment_status_history FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER fulfilment_events_immutable BEFORE UPDATE OR DELETE ON fulfilment_events FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE OR REPLACE FUNCTION shipment_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Shipments retained'; END IF;
 IF (NEW.id,NEW.order_id,NEW.recorded_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.order_id,OLD.recorded_by,OLD.created_at) THEN RAISE EXCEPTION 'Shipment identity immutable'; END IF;
 IF OLD.status='DELIVERED' OR NOT (NEW.status=OLD.status OR (OLD.status='PREPARED' AND NEW.status='SHIPPED') OR (OLD.status='SHIPPED' AND NEW.status='DELIVERED')) THEN RAISE EXCEPTION 'Invalid shipment transition'; END IF;
 IF OLD.status='SHIPPED' AND (to_jsonb(NEW)-ARRAY['status','delivered_at','delivery_evidence','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','delivered_at','delivery_evidence','updated_at']) THEN RAISE EXCEPTION 'Dispatched shipment immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shipments_controlled_update BEFORE UPDATE OR DELETE ON shipments FOR EACH ROW EXECUTE FUNCTION shipment_controlled_update();
CREATE OR REPLACE FUNCTION fulfilment_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid; os varchar; ss varchar;
BEGIN
 IF TG_TABLE_NAME='orders' THEN oid:=NEW.id; ELSE oid:=NEW.order_id; END IF;
 SELECT status INTO os FROM orders WHERE id=oid;
 SELECT status INTO ss FROM shipments WHERE order_id=oid;
 IF (ss='PREPARED' AND os<>'PROCESSING') OR (ss='SHIPPED' AND os<>'SHIPPED') OR (ss='DELIVERED' AND os<>'DELIVERED') OR (os IN ('SHIPPED','DELIVERED') AND ss IS DISTINCT FROM os) THEN RAISE EXCEPTION 'Order and shipment must agree'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER shipment_order_consistency AFTER INSERT OR UPDATE ON shipments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fulfilment_consistent();
CREATE CONSTRAINT TRIGGER order_shipment_consistency AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fulfilment_consistent();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DO $$ BEGIN IF EXISTS(SELECT 1 FROM fulfilment_events) OR EXISTS(SELECT 1 FROM shipments) THEN RAISE EXCEPTION 'Retained fulfilment records prevent rollback'; END IF; END $$;
DROP TRIGGER order_shipment_consistency ON orders;
DROP TABLE fulfilment_events, shipment_status_history, shipments;
DROP FUNCTION fulfilment_consistent();
DROP FUNCTION shipment_controlled_update();
ALTER TABLE orders DROP CONSTRAINT orders_status_check, DROP CONSTRAINT orders_paid_at_check;
ALTER TABLE orders DROP COLUMN processing_at;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('PENDING_PAYMENT','CANCELLED','PAID','PAYMENT_REVIEW'));
ALTER TABLE orders ADD CONSTRAINT orders_paid_at_check CHECK((status='PAID')=(paid_at IS NOT NULL));
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_check, DROP CONSTRAINT order_status_history_source_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_source_check CHECK(source IN ('customer','guest','owner','system'));
ALTER TABLE order_status_history ADD CHECK(
 (from_status IS NULL AND to_status='PENDING_PAYMENT' AND event='OrderCreated') OR
 (from_status='PENDING_PAYMENT' AND to_status='CANCELLED' AND event='OrderCancelled') OR
 (from_status='PENDING_PAYMENT' AND to_status='PAID' AND event='OrderPaid') OR
 (from_status='PENDING_PAYMENT' AND to_status='PAYMENT_REVIEW' AND event='OrderPaymentReview'));
CREATE OR REPLACE FUNCTION order_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Orders are retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','updated_at','cancelled_at','payment_state','paid_at','financial_hold']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','cancelled_at','payment_state','paid_at','financial_hold']) THEN RAISE EXCEPTION 'Order commercial fields are immutable'; END IF;
 IF NEW.version<>OLD.version+1 OR (OLD.financial_hold AND NOT NEW.financial_hold) OR (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at) OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN RAISE EXCEPTION 'Invalid lifecycle update'; END IF;
 IF NOT (NEW.status=OLD.status OR (OLD.status='PENDING_PAYMENT' AND NEW.status IN ('CANCELLED','PAID','PAYMENT_REVIEW'))) THEN RAISE EXCEPTION 'Unsupported order transition'; END IF;
 IF NEW.status='CANCELLED' AND OLD.status<>NEW.status AND (OLD.payment_state<>'NOT_STARTED' OR EXISTS(SELECT 1 FROM payment_attempts WHERE order_id=OLD.id)) THEN RAISE EXCEPTION 'Payment activity prevents cancellation'; END IF;
 IF NEW.status='PAID' AND (NEW.payment_state NOT IN ('SUCCESSFUL','REQUIRES_REVIEW') OR NOT EXISTS(SELECT 1 FROM payments WHERE order_id=NEW.id AND applied_at IS NOT NULL)) THEN RAISE EXCEPTION 'Applied receipt required'; END IF;
 RETURN NEW;
END $$;
SQL);
    }
};
