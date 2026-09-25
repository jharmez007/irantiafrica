<?php

namespace App\Payments;

use App\Checkout\CheckoutConfiguration;
use App\Returns\RefundService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class WebhookInbox
{
    public function __construct(private PaymentGateway $gateway, private PaymentService $payments) {}

    public function accept(string $body, string $signature): void
    {
        abort_unless(strlen($body) <= 262144, 413);
        abort_unless($this->gateway->ready(), 503);
        abort_unless($this->gateway->validateWebhook($body, $signature), 401);
        try {
            $event = $this->gateway->parseWebhook($body);
        } catch (\Throwable) {
            abort(400);
        }
        $hash = hash('sha256', $body);
        $key = hash('sha256', json_encode($event, JSON_THROW_ON_ERROR).':'.$hash);
        DB::table('webhook_inbox')->insertOrIgnore(['id' => (string) Str::uuid(), 'provider' => 'paystack', 'event_key' => $key, 'event_type' => $event['event'], 'reference' => $event['reference'], 'payload_hash' => $hash, 'normalized' => json_encode($event, JSON_THROW_ON_ERROR), 'status' => 'PENDING']);
        // Scheduler reads the committed inbox; Redis downtime cannot lose an acknowledged event.
    }

    public function process(string $id): void
    {
        $row = DB::transaction(function () use ($id): ?\stdClass {
            $r = DB::table('webhook_inbox')->where('id', $id)->lockForUpdate()->firstOrFail();
            if (in_array($r->status, ['DONE', 'QUARANTINED', 'FAILED'], true) || ($r->lease_until && CheckoutConfiguration::now()->lt($r->lease_until)) || CheckoutConfiguration::now()->lt($r->next_attempt_at)) {
                return null;
            }
            if ($r->attempts >= 12) {
                DB::table('webhook_inbox')->where('id', $id)->update(['status' => 'FAILED', 'error_code' => 'RETRY_EXHAUSTED', 'processed_at' => now(), 'lease_until' => null]);
                Log::warning('payment_webhook_review', ['inbox_id' => $id, 'reason' => 'RETRY_EXHAUSTED']);

                return null;
            }
            $r->lease_token = (string) Str::uuid();
            DB::table('webhook_inbox')->where('id', $id)->update(['lease_token' => $r->lease_token, 'status' => 'PROCESSING', 'lease_until' => now()->addMinutes(2), 'attempts' => $r->attempts + 1]);

            return $r;
        }, 3);
        if (! $row) {
            return;
        }
        $a = $row->reference ? DB::table('payment_attempts')->where('provider', 'paystack')->where('reference', $row->reference)->first() : null;
        $status = 'DONE';
        $error = null;
        if ($a && in_array($row->event_type, ['refund.pending', 'refund.processing', 'refund.needs-attention', 'refund.failed', 'refund.processed'], true)) {
            try {
                foreach (DB::table('refunds')->where('order_id', $a->order_id)->whereIn('status', ['SUBMITTING', 'PENDING', 'UNKNOWN'])->pluck('id') as $refundId) {
                    if (! app(RefundService::class)->verify($refundId, 'webhook')) {
                        throw new \RuntimeException('Verification unavailable');
                    }
                }
            } catch (\Throwable) {
                $status = $row->attempts >= 11 ? 'FAILED' : 'PENDING';
                $error = 'VERIFY_UNAVAILABLE';
            }
        } elseif ($row->event_type !== 'charge.success' || ! $a) {
            $status = 'QUARANTINED';
            $error = $a ? 'UNSUPPORTED_EVENT' : 'UNKNOWN_REFERENCE';
        } else {
            try {
                $ok = $this->payments->verify($a->id, 'webhook');
            } catch (\Throwable) {
                $ok = false;
            }
            if (! $ok) {
                $status = $row->attempts >= 11 ? 'FAILED' : 'PENDING';
                $error = 'VERIFY_UNAVAILABLE';
            }
        }
        DB::table('webhook_inbox')->where('id', $id)->where('lease_token', $row->lease_token)->update(['lease_token' => null, 'status' => $status, 'error_code' => $error, 'lease_until' => null, 'processed_at' => in_array($status, ['DONE', 'QUARANTINED', 'FAILED'], true) ? now() : null, 'next_attempt_at' => now()->addSeconds(min(3600, 30 * (2 ** min($row->attempts, 7))) + random_int(0, 20))]);
        if (in_array($status, ['FAILED', 'QUARANTINED'], true)) {
            Log::warning('payment_webhook_review', ['inbox_id' => $id, 'reason' => $error]);
        }
    }
}
