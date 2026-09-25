<?php

namespace App\Communications;

use App\Jobs\DeliverTransactionalEmail;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class NotificationDelivery
{
    public function __construct(private NotificationContent $content, private MailTransport $transport) {}

    public function relay(): int
    {
        if (! config('communications.enabled')) {
            return 0;
        }
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Relay requires committed domain events.');
        }
        $start = config('communications.start_at');
        if (app()->environment(['production', 'staging']) && (! $start || ! strtotime($start))) {
            throw new \LogicException('Explicit notification activation timestamp required.');
        }
        $count = 0;
        foreach (['order' => 'order_status_history', 'payment' => 'payment_events', 'fulfilment' => 'fulfilment_events', 'return' => 'return_events'] as $kind => $table) {
            $column = $kind.'_event_id';
            $events = match ($kind) {
                'order' => ['OrderCreated'], 'payment' => ['PaymentSucceeded', 'PaymentRequiresReview'], 'fulfilment' => ['OrderShipped', 'OrderDelivered'], 'return' => ['ReturnRequested', 'ReturnApproved', 'ReturnRejected', 'ReturnReceived', 'RefundInitiated', 'RefundSucceeded', 'RefundFailed']
            };
            $q = DB::table($table.' as source')->whereIn('source.event', $events)->whereNotExists(fn ($q) => $q->selectRaw('1')->from('outbox_events')->whereColumn($column, 'source.id'));
            if ($start) {
                $q->where('source.created_at', '>=', $start);
            }
            foreach ($q->orderBy('source.created_at')->orderBy('source.id')->limit(100)->get() as $event) {
                $created = DB::transaction(function () use ($event, $kind, $column, $table): bool {
                    // Lock the committed source to serialize competing relays; no business state changes.
                    DB::table($table)->where('id', $event->id)->lockForUpdate()->firstOrFail();
                    if (DB::table('outbox_events')->where($column, $event->id)->exists()) {
                        return false;
                    }
                    $returnId = $kind === 'return' ? $event->return_request_id : null;
                    $orderId = $returnId ? DB::table('return_requests')->where('id', $returnId)->value('order_id') : $event->order_id;
                    $o = DB::table('orders')->where('id', $orderId)->firstOrFail();
                    $payload = $this->content->snapshot($event->event, $orderId, $returnId, $event->created_at);
                    $eventId = (string) Str::uuid7();
                    $id = (string) Str::uuid7();
                    DB::table('outbox_events')->insert(['id' => $eventId, 'source_kind' => $kind, $column => $event->id, 'order_id' => $orderId, 'event_type' => $event->event, 'payload' => json_encode($payload, JSON_THROW_ON_ERROR), 'occurred_at' => $event->created_at]);
                    $recipient = strtolower(trim($o->contact_email));
                    $masked = '***@'.(explode('@', $recipient, 2)[1] ?? 'invalid');
                    DB::table('notification_deliveries')->insert(['id' => $id, 'outbox_event_id' => $eventId, 'template_code' => $event->event, 'template_version' => 'v1', 'recipient_hash' => hash_hmac('sha256', $recipient, (string) config('app.key')), 'recipient_ciphertext' => Crypt::encryptString($recipient), 'recipient_masked' => $masked]);
                    $this->metric('queued', $id, $event->event, 0);

                    return true;
                }, 3);
                if ($created) {
                    $count++;
                }
            }
        }
        $this->recoverExpired();
        foreach (DB::table('notification_deliveries')->where('status', 'PENDING')->whereRaw('next_attempt_at <= CURRENT_TIMESTAMP')->orderBy('next_attempt_at')->limit(100)->pluck('id') as $id) {
            try {
                DeliverTransactionalEmail::dispatch($id)->onConnection('redis')->onQueue('transactional')->afterCommit();
                DB::table('notification_deliveries')->where('id', $id)->whereNull('queued_at')->update(['queued_at' => now()]);
            } catch (\Throwable) {
                Log::warning('notification_dispatch_unavailable', ['notification_id' => $id]);
            }
        }

        return $count;
    }

    public function deliver(string $id): void
    {
        if (! config('communications.enabled')) {
            return;
        }
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Email cannot be sent inside a business transaction.');
        }
        $r = DB::transaction(function () use ($id): ?\stdClass {
            $d = DB::table('notification_deliveries')->where('id', $id)->lockForUpdate()->firstOrFail();
            if ($d->status !== 'PENDING' || now()->lt($d->next_attempt_at)) {
                return null;
            }
            if ($d->attempts >= 5) {
                DB::table('notification_deliveries')->where('id', $id)->update(['status' => 'FAILED', 'failed_at' => now(), 'error_code' => 'ATTEMPTS_EXHAUSTED']);

                return null;
            }
            $d->lease_token = (string) Str::uuid();
            $d->attempts++;
            DB::table('notification_deliveries')->where('id', $id)->update(['status' => 'SENDING', 'attempts' => $d->attempts, 'lease_token' => $d->lease_token, 'lease_until' => now()->addSeconds(75), 'updated_at' => now()]);
            DB::table('notification_attempts')->insert(['id' => (string) Str::uuid7(), 'notification_delivery_id' => $id, 'attempt_number' => $d->attempts, 'status' => 'SENDING']);

            return $d;
        }, 3);
        if (! $r) {
            return;
        }
        try {
            $payload = json_decode(DB::table('outbox_events')->where('id', $r->outbox_event_id)->value('payload'), true, 512, JSON_THROW_ON_ERROR);
            $recipient = Crypt::decryptString($r->recipient_ciphertext);
        } catch (\Throwable) {
            $this->finish($r, ['status' => 'FAILED', 'code' => 'ENCRYPTED_DATA_UNAVAILABLE', 'message_id' => null]);

            return;
        }
        $result = $this->transport->send($recipient, $payload, $id);
        $this->finish($r, $result);
    }

    /** @param array{status:string,code:?string,message_id:?string} $result */
    private function finish(\stdClass $r, array $result): void
    {
        DB::transaction(function () use ($r, $result): void {
            $d = DB::table('notification_deliveries')->where('id', $r->id)->lockForUpdate()->firstOrFail();
            if ($d->status !== 'SENDING' || $d->lease_token !== $r->lease_token) {
                return;
            }
            $retry = $result['status'] === 'RETRY' && $d->attempts < 5;
            $status = $retry ? 'PENDING' : ($result['status'] === 'RETRY' ? 'FAILED' : $result['status']);
            $code = $result['status'] === 'RETRY' && ! $retry ? 'ATTEMPTS_EXHAUSTED' : $result['code'];
            DB::table('notification_deliveries')->where('id', $d->id)->update(['status' => $status, 'lease_token' => null, 'lease_until' => null, 'provider_message_id' => $result['message_id'], 'error_code' => $code, 'sent_at' => $status === 'SENT' ? now() : null, 'failed_at' => in_array($status, ['FAILED', 'UNKNOWN'], true) ? now() : null, 'next_attempt_at' => now()->addSeconds(match ($d->attempts) {
                1 => 60, 2 => 300, 3 => 900, default => 3600
            }), 'updated_at' => now()]);
            DB::table('notification_attempts')->where('notification_delivery_id', $d->id)->where('attempt_number', $d->attempts)->update(['status' => $retry ? 'RETRY' : $status, 'completed_at' => now(), 'error_code' => $code]);
            $this->metric(strtolower($status), $d->id, $d->template_code, $d->attempts);
        }, 3);
    }

    public function recoverExpired(): void
    {
        foreach (DB::table('notification_deliveries')->where('status', 'SENDING')->where('lease_until', '<=', now())->limit(100)->get() as $r) {
            $this->finish($r, ['status' => 'UNKNOWN', 'code' => 'WORKER_OUTCOME_UNKNOWN', 'message_id' => null]);
        }
    }

    private function metric(string $status, string $id, string $type, int $attempts): void
    {
        Log::info('notification_delivery', ['status' => $status, 'notification_id' => $id, 'type' => $type, 'attempts' => $attempts]);
    }
}
