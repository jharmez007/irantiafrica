<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('PENDING_PAYMENT','CANCELLED','PAID','PAYMENT_REVIEW'));
ALTER TABLE orders DROP CONSTRAINT orders_payment_state_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_state_check CHECK(payment_state IN ('NOT_STARTED','PENDING','SUCCESSFUL','FAILED','ABANDONED','REQUIRES_REVIEW'));
ALTER TABLE orders ADD COLUMN paid_at timestamptz, ADD COLUMN financial_hold boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD CHECK((status='PAID')=(paid_at IS NOT NULL));
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_event_check, DROP CONSTRAINT order_status_history_check;
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
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 provider varchar(24) NOT NULL CHECK(provider ~ '^[a-z_]{1,24}$'), reference varchar(120) NOT NULL,
 request_key uuid NOT NULL, method varchar(24) NOT NULL CHECK(method IN ('card','bank_transfer')),
 expected_amount_minor bigint NOT NULL CHECK(expected_amount_minor>0), currency char(3) NOT NULL CHECK(currency='NGN'),
 status varchar(24) NOT NULL CHECK(status IN ('INITIALIZING','PENDING','UNKNOWN','SUCCEEDED','FAILED','ABANDONED','REQUIRES_REVIEW')),
 authorization_url text, provider_status varchar(32), failure_code varchar(64),
 checks integer NOT NULL DEFAULT 0 CHECK(checks>=0), last_checked_at timestamptz, next_check_at timestamptz,
 lease_until timestamptz, lease_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,reference), UNIQUE(order_id,request_key), UNIQUE(id,order_id)
);
CREATE UNIQUE INDEX payment_active_intent ON payment_attempts(order_id) WHERE status IN ('INITIALIZING','PENDING','UNKNOWN');
CREATE INDEX payment_attempt_due ON payment_attempts(next_check_at);
CREATE TABLE payments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT, attempt_id uuid NOT NULL,
 provider varchar(24) NOT NULL, provider_transaction_id varchar(120) NOT NULL, provider_reference varchar(120) NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>=0), currency varchar(3) NOT NULL, channel varchar(32) NOT NULL,
 verified_at timestamptz NOT NULL, applied_at timestamptz, exception_code varchar(64), verification_source varchar(24) NOT NULL,
 UNIQUE(provider,provider_transaction_id), UNIQUE(provider,provider_reference),
 FOREIGN KEY(attempt_id,order_id) REFERENCES payment_attempts(id,order_id) ON DELETE RESTRICT,
 CHECK(applied_at IS NULL OR (currency='NGN' AND exception_code IS NULL))
);
CREATE UNIQUE INDEX payment_one_applied ON payments(order_id) WHERE applied_at IS NOT NULL;
CREATE TABLE payment_reconciliation_records (
 id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
 source varchar(24) NOT NULL, outcome varchar(64) NOT NULL, previous_status varchar(24) NOT NULL, status varchar(24) NOT NULL,
 normalized jsonb NOT NULL DEFAULT '{}', actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_inbox (
 id uuid PRIMARY KEY, provider varchar(24) NOT NULL, event_key char(64) NOT NULL, event_type varchar(64) NOT NULL,
 reference varchar(120), payload_hash char(64) NOT NULL, normalized jsonb NOT NULL,
 status varchar(24) NOT NULL CHECK(status IN ('PENDING','PROCESSING','DONE','QUARANTINED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, error_code varchar(64), UNIQUE(provider,event_key)
);
CREATE INDEX webhook_due ON webhook_inbox(status,next_attempt_at);
CREATE TABLE payment_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 attempt_id uuid NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
 event varchar(64) NOT NULL, event_key varchar(180) NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER payment_records_immutable BEFORE UPDATE OR DELETE ON payment_reconciliation_records FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE TRIGGER payment_events_immutable BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE OR REPLACE FUNCTION payment_attempt_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment attempts retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','authorization_url','provider_status','failure_code','checks','last_checked_at','next_check_at','lease_until','lease_token','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','authorization_url','provider_status','failure_code','checks','last_checked_at','next_check_at','lease_until','lease_token','updated_at']) THEN RAISE EXCEPTION 'Payment intent immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_attempt_controlled BEFORE UPDATE OR DELETE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION payment_attempt_controlled_update();
SQL);
    }

    public function down(): void
    {
        if (DB::table('payment_attempts')->exists() || DB::table('webhook_inbox')->exists()) {
            throw new LogicException('Financial evidence is retained. Rollback requires a verified backup and an explicit data migration.');
        }
        DB::unprepared(<<<'SQL'
DROP TABLE payment_events, webhook_inbox, payment_reconciliation_records, payments, payment_attempts;
DROP FUNCTION payment_attempt_controlled_update();
ALTER TABLE orders DROP CONSTRAINT orders_status_check, DROP CONSTRAINT orders_payment_state_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('PENDING_PAYMENT','CANCELLED'));
ALTER TABLE orders ADD CONSTRAINT orders_payment_state_check CHECK(payment_state='NOT_STARTED');
ALTER TABLE orders DROP COLUMN paid_at, DROP COLUMN financial_hold;
ALTER TABLE order_status_history DROP CONSTRAINT order_status_history_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_event_check CHECK(event IN ('OrderCreated','OrderCancelled'));
ALTER TABLE order_status_history ADD CHECK((from_status IS NULL AND to_status='PENDING_PAYMENT' AND event='OrderCreated') OR (from_status='PENDING_PAYMENT' AND to_status='CANCELLED' AND event='OrderCancelled'));
CREATE OR REPLACE FUNCTION order_controlled_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Orders are retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','updated_at','cancelled_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','cancelled_at']) THEN
 RAISE EXCEPTION 'Order commercial fields are immutable'; END IF;
 IF NOT (OLD.status='PENDING_PAYMENT' AND NEW.status='CANCELLED' AND NEW.version=OLD.version+1) THEN
 RAISE EXCEPTION 'Unsupported order transition'; END IF;
 RETURN NEW;
END $$;
SQL);
    }
};
