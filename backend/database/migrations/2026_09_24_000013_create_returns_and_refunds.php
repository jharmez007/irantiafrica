<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE return_policies (
 id uuid PRIMARY KEY, version_code varchar(100) NOT NULL UNIQUE, development_only boolean NOT NULL,
 policy jsonb NOT NULL CHECK(jsonb_typeof(policy)='object'), approval_reference varchar(500) NOT NULL,
 published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE return_requests (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 requested_by uuid REFERENCES users(id) ON DELETE RESTRICT, policy_version_id uuid NOT NULL REFERENCES return_policies(id) ON DELETE RESTRICT,
 request_key uuid NOT NULL, request_hash char(64) NOT NULL,
 status varchar(20) NOT NULL CHECK(status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','RECEIVED','CLOSED')),
 reason_code varchar(32) NOT NULL CHECK(reason_code IN ('DAMAGED_PRODUCT','WRONG_PRODUCT_DELIVERED','DEFECTIVE_PRODUCT')),
 customer_note varchar(2000), anchor_at timestamptz NOT NULL, cutoff_at timestamptz NOT NULL CHECK(cutoff_at>=anchor_at),
 submitted_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 decided_by uuid REFERENCES users(id) ON DELETE RESTRICT, decided_at timestamptz, decision_reason varchar(1000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,request_key), UNIQUE(id,order_id)
);
CREATE INDEX return_queue ON return_requests(status,submitted_at,id);
CREATE INDEX return_request_actor ON return_requests(requested_by);
ALTER TABLE order_items ADD CONSTRAINT order_items_id_order_unique UNIQUE(id,order_id);
CREATE TABLE return_items (
 id uuid PRIMARY KEY, return_request_id uuid NOT NULL, order_id uuid NOT NULL, order_item_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), approved_quantity integer NOT NULL DEFAULT 0,
 received_quantity integer NOT NULL DEFAULT 0, restocked_quantity integer NOT NULL DEFAULT 0,
 disposition varchar(24) CHECK(disposition IN ('SALEABLE','DAMAGED','QUARANTINED','DISPOSED')),
 inspected_by uuid REFERENCES users(id) ON DELETE RESTRICT, inspected_at timestamptz, inspection_note varchar(1000),
 FOREIGN KEY(return_request_id,order_id) REFERENCES return_requests(id,order_id) ON DELETE RESTRICT,
 FOREIGN KEY(order_item_id,order_id) REFERENCES order_items(id,order_id) ON DELETE RESTRICT,
 UNIQUE(return_request_id,order_item_id), UNIQUE(id,order_item_id),
 CHECK(0<=restocked_quantity AND restocked_quantity<=received_quantity AND received_quantity<=approved_quantity AND approved_quantity<=quantity),
 CHECK(restocked_quantity=0 OR disposition='SALEABLE')
);
CREATE INDEX return_item_order ON return_items(order_id);
CREATE TABLE return_units (
 id uuid PRIMARY KEY, return_item_id uuid NOT NULL, order_item_id uuid NOT NULL,
 unit_number integer NOT NULL CHECK(unit_number>0), active boolean NOT NULL DEFAULT true,
 base_minor bigint NOT NULL CHECK(base_minor>=0), tax_minor bigint NOT NULL CHECK(tax_minor>=0),
 FOREIGN KEY(return_item_id,order_item_id) REFERENCES return_items(id,order_item_id) ON DELETE RESTRICT,
 UNIQUE(return_item_id,unit_number)
);
CREATE UNIQUE INDEX return_unit_active ON return_units(order_item_id,unit_number) WHERE active;
CREATE TABLE return_status_history (
 id uuid PRIMARY KEY, return_request_id uuid NOT NULL REFERENCES return_requests(id) ON DELETE RESTRICT,
 event varchar(64) NOT NULL, from_status varchar(20), to_status varchar(20) NOT NULL,
 actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, note varchar(1000), context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_history_date ON return_status_history(return_request_id,created_at,id);
CREATE TABLE return_events (
 id uuid PRIMARY KEY, return_request_id uuid NOT NULL REFERENCES return_requests(id) ON DELETE RESTRICT,
 event_key varchar(180) NOT NULL UNIQUE, event varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refunds (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
 return_request_id uuid NOT NULL UNIQUE REFERENCES return_requests(id) ON DELETE RESTRICT,
 merchant_reference varchar(120) NOT NULL UNIQUE,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), currency char(3) NOT NULL CHECK(currency='NGN'),
 allocation_snapshot jsonb NOT NULL CHECK(jsonb_typeof(allocation_snapshot)='object'),
 approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz NOT NULL DEFAULT now(), reason varchar(1000) NOT NULL,
 status varchar(16) NOT NULL CHECK(status IN ('APPROVED','SUBMITTING','PENDING','SUCCEEDED','FAILED','UNKNOWN')),
 provider_refund_id varchar(120) UNIQUE, submitted_at timestamptz, completed_at timestamptz,
 lease_token uuid, lease_until timestamptz, next_check_at timestamptz, checks integer NOT NULL DEFAULT 0 CHECK(checks>=0), error_code varchar(80),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refund_payment ON refunds(payment_id,status);
CREATE INDEX refund_due ON refunds(status,next_check_at);
CREATE TABLE refund_attempts (
 id uuid PRIMARY KEY, refund_id uuid NOT NULL UNIQUE REFERENCES refunds(id) ON DELETE RESTRICT,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), payment_reference varchar(120) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refund_status_history (
 id uuid PRIMARY KEY, refund_id uuid NOT NULL REFERENCES refunds(id) ON DELETE RESTRICT,
 from_status varchar(16), to_status varchar(16) NOT NULL, source varchar(24) NOT NULL,
 actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, normalized jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refund_history_date ON refund_status_history(refund_id,created_at,id);
CREATE TRIGGER return_policy_immutable BEFORE UPDATE OR DELETE ON return_policies FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER return_history_immutable BEFORE UPDATE OR DELETE ON return_status_history FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER return_events_immutable BEFORE UPDATE OR DELETE ON return_events FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER refund_attempt_immutable BEFORE UPDATE OR DELETE ON refund_attempts FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER refund_history_immutable BEFORE UPDATE OR DELETE ON refund_status_history FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE OR REPLACE FUNCTION return_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Returns retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','updated_at','decided_by','decided_at','decision_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','decided_by','decided_at','decision_reason']) THEN RAISE EXCEPTION 'Return request immutable'; END IF;
 IF NEW.version<>OLD.version+1 OR (OLD.decided_at IS NOT NULL AND (NEW.decided_at,NEW.decided_by,NEW.decision_reason) IS DISTINCT FROM (OLD.decided_at,OLD.decided_by,OLD.decision_reason)) THEN RAISE EXCEPTION 'Invalid return version/decision'; END IF;
 IF NOT(NEW.status=OLD.status OR (OLD.status='SUBMITTED' AND NEW.status IN ('UNDER_REVIEW','APPROVED','REJECTED')) OR (OLD.status='UNDER_REVIEW' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status='APPROVED' AND NEW.status IN ('RECEIVED','CLOSED')) OR (OLD.status='RECEIVED' AND NEW.status='CLOSED')) THEN RAISE EXCEPTION 'Invalid return transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER return_controlled BEFORE UPDATE OR DELETE ON return_requests FOR EACH ROW EXECUTE FUNCTION return_controlled_update();
CREATE OR REPLACE FUNCTION return_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q integer; b bigint; t bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Return unit allocations retained'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') OR (NOT OLD.active AND NEW.active)) THEN RAISE EXCEPTION 'Unit allocation immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.active IS DISTINCT FROM OLD.active AND EXISTS(SELECT 1 FROM return_items i JOIN return_requests r ON r.id=i.return_request_id WHERE i.id=NEW.return_item_id AND r.status NOT IN ('SUBMITTED','UNDER_REVIEW')) THEN RAISE EXCEPTION 'Decided unit allocation retained'; END IF;
 SELECT quantity,unit_price_minor,tax_minor INTO q,b,t FROM order_items WHERE id=NEW.order_item_id;
 IF NEW.unit_number>q OR NEW.base_minor<>b OR NEW.tax_minor<>(t/q+CASE WHEN NEW.unit_number<=t%q THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Invalid historical unit allocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER return_units_guard BEFORE INSERT OR UPDATE OR DELETE ON return_units FOR EACH ROW EXECUTE FUNCTION return_unit_guard();
CREATE OR REPLACE FUNCTION return_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Return items retained'; END IF;
 IF (NEW.id,NEW.return_request_id,NEW.order_id,NEW.order_item_id,NEW.quantity) IS DISTINCT FROM (OLD.id,OLD.return_request_id,OLD.order_id,OLD.order_item_id,OLD.quantity) OR NEW.received_quantity<OLD.received_quantity OR NEW.restocked_quantity<OLD.restocked_quantity THEN RAISE EXCEPTION 'Invalid return item update'; END IF;
 IF NEW.approved_quantity<>OLD.approved_quantity AND EXISTS(SELECT 1 FROM return_requests WHERE id=NEW.return_request_id AND status NOT IN ('SUBMITTED','UNDER_REVIEW')) THEN RAISE EXCEPTION 'Approved quantity retained'; END IF;
 IF OLD.inspected_at IS NOT NULL AND (NEW.disposition,NEW.inspected_at,NEW.inspected_by,NEW.inspection_note) IS DISTINCT FROM (OLD.disposition,OLD.inspected_at,OLD.inspected_by,OLD.inspection_note) THEN RAISE EXCEPTION 'Inspection retained'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER return_items_guard BEFORE UPDATE OR DELETE ON return_items FOR EACH ROW EXECUTE FUNCTION return_item_guard();
CREATE OR REPLACE FUNCTION return_allocation_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_id uuid; i record; n integer; a integer; state varchar;
BEGIN
 IF TG_TABLE_NAME='return_units' THEN item_id:=NEW.return_item_id; ELSE item_id:=NEW.id; END IF;
 SELECT * INTO i FROM return_items WHERE id=item_id;
 SELECT status INTO state FROM return_requests WHERE id=i.return_request_id;
 SELECT count(*),count(*) FILTER(WHERE active) INTO n,a FROM return_units WHERE return_item_id=item_id;
 IF n<>i.quantity OR a<>(CASE WHEN state IN ('SUBMITTED','UNDER_REVIEW') THEN i.quantity ELSE i.approved_quantity END) THEN RAISE EXCEPTION 'Return quantities must match allocated historical units'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER return_item_allocations AFTER INSERT OR UPDATE ON return_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION return_allocation_consistency();
CREATE CONSTRAINT TRIGGER return_unit_allocations AFTER INSERT OR UPDATE ON return_units DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION return_allocation_consistency();
CREATE OR REPLACE FUNCTION refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE captured bigint; total numeric; po uuid; ro uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refunds retained'; END IF;
 SELECT amount_minor,order_id INTO captured,po FROM payments WHERE id=NEW.payment_id AND applied_at IS NOT NULL AND currency='NGN' FOR UPDATE;
 SELECT order_id INTO ro FROM return_requests WHERE id=NEW.return_request_id;
 IF captured IS NULL OR po<>NEW.order_id OR ro<>NEW.order_id THEN RAISE EXCEPTION 'Refund requires same-order applied payment'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','provider_refund_id','submitted_at','completed_at','lease_token','lease_until','next_check_at','checks','error_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider_refund_id','submitted_at','completed_at','lease_token','lease_until','next_check_at','checks','error_code','updated_at']) THEN RAISE EXCEPTION 'Approved refund immutable'; END IF;
 IF TG_OP='INSERT' AND NEW.status<>'APPROVED' THEN RAISE EXCEPTION 'Refund begins with approval'; END IF;
 IF TG_OP='INSERT' AND NEW.amount_minor<>(SELECT COALESCE(sum(u.base_minor+u.tax_minor),0) FROM return_units u JOIN return_items i ON i.id=u.return_item_id WHERE i.return_request_id=NEW.return_request_id AND u.active) THEN RAISE EXCEPTION 'Refund must equal approved historical units'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM return_requests WHERE id=NEW.return_request_id AND status IN ('APPROVED','RECEIVED')) THEN RAISE EXCEPTION 'Return not approved'; END IF;
 IF TG_OP='UPDATE' AND NOT(NEW.status=OLD.status OR (OLD.status='APPROVED' AND NEW.status='SUBMITTING') OR (OLD.status IN ('SUBMITTING','PENDING','UNKNOWN') AND NEW.status IN ('PENDING','UNKNOWN','SUCCEEDED','FAILED'))) THEN RAISE EXCEPTION 'Invalid refund transition'; END IF;
 IF TG_OP='UPDATE' AND OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN RAISE EXCEPTION 'Provider refund identity retained'; END IF;
 SELECT COALESCE(sum(amount_minor),0) INTO total FROM refunds WHERE payment_id=NEW.payment_id AND id<>NEW.id AND status<>'FAILED';
 IF NEW.status<>'FAILED' AND total+NEW.amount_minor>captured THEN RAISE EXCEPTION 'Refund budget exceeded'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refunds_guard BEFORE INSERT OR UPDATE OR DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION refund_guard();
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DO $$ BEGIN IF EXISTS(SELECT 1 FROM return_requests) OR EXISTS(SELECT 1 FROM refunds) THEN RAISE EXCEPTION 'Retained returns/refunds prevent rollback'; END IF; END $$;
DROP TABLE refund_status_history,refund_attempts,refunds,return_events,return_status_history,return_units,return_items,return_requests,return_policies;
DROP FUNCTION return_allocation_consistency(),refund_guard(),return_item_guard(),return_unit_guard(),return_controlled_update();
ALTER TABLE order_items DROP CONSTRAINT order_items_id_order_unique;
SQL);
    }
};
