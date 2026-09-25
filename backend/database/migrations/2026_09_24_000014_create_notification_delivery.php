<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE outbox_events (
 id uuid PRIMARY KEY, source_kind varchar(20) NOT NULL CHECK(source_kind IN ('order','payment','fulfilment','return')),
 order_event_id uuid REFERENCES order_status_history(id) ON DELETE RESTRICT,
 payment_event_id uuid REFERENCES payment_events(id) ON DELETE RESTRICT,
 fulfilment_event_id uuid REFERENCES fulfilment_events(id) ON DELETE RESTRICT,
 return_event_id uuid REFERENCES return_events(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 event_type varchar(80) NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(order_event_id,payment_event_id,fulfilment_event_id,return_event_id)=1),
 CHECK((source_kind='order' AND order_event_id IS NOT NULL) OR (source_kind='payment' AND payment_event_id IS NOT NULL) OR (source_kind='fulfilment' AND fulfilment_event_id IS NOT NULL) OR (source_kind='return' AND return_event_id IS NOT NULL)),
 UNIQUE(order_event_id),UNIQUE(payment_event_id),UNIQUE(fulfilment_event_id),UNIQUE(return_event_id)
);
CREATE INDEX notification_event_order ON outbox_events(order_id);
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY, outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE RESTRICT,
 template_code varchar(80) NOT NULL, template_version varchar(40) NOT NULL,
 recipient_hash char(64) NOT NULL, recipient_ciphertext text NOT NULL, recipient_masked varchar(254) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','SIMULATED','UNKNOWN','FAILED','BOUNCED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 lease_token uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 queued_at timestamptz, sent_at timestamptz, failed_at timestamptz, provider_message_id varchar(160), error_code varchar(80),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(outbox_event_id,template_code,recipient_hash)
);
CREATE INDEX notification_due ON notification_deliveries(status,next_attempt_at);
CREATE TABLE notification_attempts (
 id uuid PRIMARY KEY, notification_delivery_id uuid NOT NULL REFERENCES notification_deliveries(id) ON DELETE RESTRICT,
 attempt_number integer NOT NULL CHECK(attempt_number>0), status varchar(16) NOT NULL CHECK(status IN ('SENDING','SENT','SIMULATED','UNKNOWN','FAILED','RETRY')),
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error_code varchar(80),
 UNIQUE(notification_delivery_id,attempt_number)
);
CREATE TRIGGER notification_event_immutable BEFORE UPDATE OR DELETE ON outbox_events FOR EACH ROW EXECUTE FUNCTION order_append_only();
CREATE OR REPLACE FUNCTION notification_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification evidence retained'; END IF;
 IF (NEW.id,NEW.outbox_event_id,NEW.template_code,NEW.template_version,NEW.recipient_hash,NEW.recipient_ciphertext,NEW.recipient_masked,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.outbox_event_id,OLD.template_code,OLD.template_version,OLD.recipient_hash,OLD.recipient_ciphertext,OLD.recipient_masked,OLD.created_at) THEN RAISE EXCEPTION 'Notification identity immutable'; END IF;
 IF NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 THEN RAISE EXCEPTION 'Invalid attempt counter'; END IF;
 IF NOT(NEW.status=OLD.status OR (OLD.status='PENDING' AND NEW.status IN ('SENDING','FAILED')) OR (OLD.status='SENDING' AND NEW.status IN ('PENDING','SENT','SIMULATED','UNKNOWN','FAILED'))) THEN RAISE EXCEPTION 'Invalid notification transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_delivery_controlled BEFORE UPDATE OR DELETE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION notification_delivery_guard();
CREATE OR REPLACE FUNCTION notification_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification attempt retained'; END IF;
 IF OLD.status<>'SENDING' OR NEW.status='SENDING' OR NEW.completed_at IS NULL OR (NEW.id,NEW.notification_delivery_id,NEW.attempt_number,NEW.started_at) IS DISTINCT FROM (OLD.id,OLD.notification_delivery_id,OLD.attempt_number,OLD.started_at) THEN RAISE EXCEPTION 'Notification observation immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_attempt_controlled BEFORE UPDATE OR DELETE ON notification_attempts FOR EACH ROW EXECUTE FUNCTION notification_attempt_guard();
SQL);
    }

    public function down(): void
    {
        DB::unprepared("DO $$ BEGIN IF EXISTS(SELECT 1 FROM notification_deliveries) THEN RAISE EXCEPTION 'Notification evidence prevents rollback'; END IF; END $$; DROP TABLE notification_attempts,notification_deliveries,outbox_events; DROP FUNCTION notification_delivery_guard(),notification_attempt_guard();");
    }
};
