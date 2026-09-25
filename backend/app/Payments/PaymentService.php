<?php

namespace App\Payments;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Inventory\InventoryService;
use App\Models\Order;
use App\Models\User;
use App\Orders\OrderService;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class PaymentService
{
    public function __construct(private PaymentGateway $gateway, private OrderService $orders, private InventoryService $stock) {}

    public function initialize(string $orderId, ?User $user, ?string $token, string $key, string $method): \stdClass
    {
        abort_unless($this->gateway->ready(), 503);
        [$attempt, $created] = DB::transaction(function () use ($orderId, $user, $token, $key, $method): array {
            if ($user) {
                $user = User::where('id', $user->id)->lockForUpdate()->firstOrFail();
                abort_unless($user->status === 'active', 401);
            }
            $o = Order::where('id', $orderId)->lockForUpdate()->firstOrFail();
            $this->orders->owned($orderId, $user, $token);
            $previous = DB::table('payment_attempts')->where('order_id', $o->id)->where('request_key', $key)->first();
            if ($previous) {
                if ($previous->method !== $method) {
                    throw new CheckoutConflict('IDEMPOTENCY_CONFLICT', 'This payment key was used with another method.');
                }

                return [$previous, false];
            }
            if ($o->status !== 'PENDING_PAYMENT' || $o->financial_hold || $o->currency !== 'NGN' || (int) $o->total_minor <= 0) {
                throw new CheckoutConflict('PAYMENT_INELIGIBLE', 'This order cannot start a payment.');
            }
            $r = $this->stock->expire($o->current_reservation_id)->reservation;
            if ($r->status !== 'ACTIVE') {
                return [new CheckoutConflict('PAYMENT_RESERVATION_EXPIRED', 'The reservation has ended. This order needs stock review before payment.'), false];
            }
            if (DB::table('payment_attempts')->where('order_id', $o->id)->whereIn('status', ['INITIALIZING', 'PENDING', 'UNKNOWN'])->exists()) {
                throw new CheckoutConflict('PAYMENT_ACTIVE', 'Recheck the existing payment before trying again.');
            }
            $id = (string) Str::uuid();
            DB::table('payment_attempts')->insert(['id' => $id, 'order_id' => $o->id, 'provider' => $this->gateway->provider(), 'reference' => 'IRA-P-'.bin2hex(random_bytes(20)), 'request_key' => $key, 'method' => $method, 'expected_amount_minor' => $o->total_minor, 'currency' => $o->currency, 'status' => 'INITIALIZING', 'next_check_at' => now()->addMinute()]);
            $this->orders->paymentUpdate($o, 'PENDING');
            $a = $this->attempt($id);
            $this->record($a, 'initialization', 'INTENT_CREATED', 'INITIALIZING', [], null);

            return [$a, true];
        }, 3);
        if ($attempt instanceof CheckoutConflict) {
            throw $attempt;
        }
        if (! $created) {
            return $attempt;
        }
        $o = Order::findOrFail($orderId);
        $callback = rtrim((string) config('payments.return_origin'), '/').'/orders/'.$o->id.'/payment-return';
        $url = $this->gateway->initializePayment($attempt->reference, (string) $attempt->expected_amount_minor, $attempt->currency, $o->contact_email, $callback, $method);

        return DB::transaction(function () use ($orderId, $attempt, $url): \stdClass {
            Order::where('id', $orderId)->lockForUpdate()->firstOrFail();
            $a = DB::table('payment_attempts')->where('id', $attempt->id)->lockForUpdate()->firstOrFail();
            if ($a->status === 'INITIALIZING') {
                DB::table('payment_attempts')->where('id', $a->id)->update(['status' => $url ? 'PENDING' : 'UNKNOWN', 'authorization_url' => $url ? Crypt::encryptString($url) : null, 'failure_code' => $url ? null : 'INITIALIZATION_UNCERTAIN', 'updated_at' => now()]);
                $this->record($this->attempt($a->id), 'initialization', $url ? 'INITIALIZED' : 'INITIALIZATION_UNCERTAIN', 'INITIALIZING', [], null);
            }

            return $this->attempt($a->id);
        }, 3);
    }

    public function attempt(string $id): \stdClass
    {
        return DB::table('payment_attempts')->where('id', $id)->firstOrFail();
    }

    /** Network verification is leased and outside all order/stock locks. */
    public function verify(string $id, string $source, ?string $actor = null): bool
    {
        if (! $this->gateway->ready()) {
            return false;
        }
        $a = $this->attempt($id);
        $lease = DB::transaction(function () use ($a, $source): ?string {
            Order::where('id', $a->order_id)->lockForUpdate()->firstOrFail();
            $row = DB::table('payment_attempts')->where('id', $a->id)->lockForUpdate()->firstOrFail();
            if ($source === 'scheduler' && (! in_array($row->status, ['INITIALIZING', 'PENDING', 'UNKNOWN'], true) || ! $row->next_check_at || CheckoutConfiguration::now()->lt($row->next_check_at))) {
                return null;
            }
            if ($row->lease_until && CheckoutConfiguration::now()->lt($row->lease_until)) {
                return null;
            }
            $token = (string) Str::uuid();
            DB::table('payment_attempts')->where('id', $a->id)->update(['lease_until' => now()->addSeconds(45), 'lease_token' => $token]);

            return $token;
        }, 3);
        if (! $lease) {
            return false;
        }
        $v = $this->gateway->verifyPayment($a->reference);
        $this->finalize($id, $v, $source, $actor, $lease);

        return $v->state !== 'UNKNOWN';
    }

    /** Internal entry point: only authenticated adapter observations, never request DTOs. */
    public function finalize(string $id, Verification $v, string $source, ?string $actor = null, ?string $lease = null): void
    {
        $initial = $this->attempt($id);
        DB::transaction(function () use ($initial, $v, $source, $actor, $lease): void {
            if ($v->transactionId !== null) {
                DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', [$initial->provider.':'.$v->transactionId]);
            }
            $o = Order::where('id', $initial->order_id)->lockForUpdate()->firstOrFail();
            $a = DB::table('payment_attempts')->where('id', $initial->id)->lockForUpdate()->firstOrFail();
            if ($lease !== null && $a->lease_token !== $lease) {
                return;
            }
            $old = $a->status;
            $code = $v->state;
            $status = $v->state;
            $paymentState = $o->payment_state;
            $existing = DB::table('payments')->where('provider', $a->provider)->where('provider_reference', $a->reference)->first();
            $match = $v->reference === $a->reference && $v->amount === (string) $a->expected_amount_minor && $v->currency === $a->currency && $v->mode === config('payments.mode');
            if ($v->state !== 'UNKNOWN' && ! $match) {
                $status = 'REQUIRES_REVIEW';
                $code = 'VERIFICATION_MISMATCH';
            }
            if ($v->state === 'SUCCEEDED') {
                $collision = DB::table('payments')->where('provider', $a->provider)->where('provider_transaction_id', $v->transactionId)->first();
                if ($existing) {
                    if ($existing->provider_transaction_id !== $v->transactionId || ! $match) {
                        $status = 'REQUIRES_REVIEW';
                        $code = 'RECEIPT_CONFLICT';
                    } else {
                        $status = $existing->applied_at ? 'SUCCEEDED' : 'REQUIRES_REVIEW';
                        $code = 'REPLAY';
                    }
                } elseif ($collision || $v->reference !== $a->reference || $v->transactionId === null) {
                    $status = 'REQUIRES_REVIEW';
                    $code = 'PROVIDER_REFERENCE_COLLISION';
                } else {
                    $exception = $match ? null : 'VERIFICATION_MISMATCH';
                    if (! in_array($v->channel, ['card', 'bank_transfer'], true)) {
                        $exception = 'UNSUPPORTED_CHANNEL';
                    }
                    if ($o->status !== 'PENDING_PAYMENT' || $o->financial_hold) {
                        $exception ??= 'ORDER_NOT_ELIGIBLE';
                    }
                    if ($exception === null && $this->stock->consume($o->current_reservation_id)->reservation->status !== 'COMMITTED') {
                        $exception = 'RESERVATION_ENDED';
                    }
                    DB::table('payments')->insert(['id' => (string) Str::uuid(), 'order_id' => $o->id, 'attempt_id' => $a->id, 'provider' => $this->gateway->provider(), 'provider_transaction_id' => $v->transactionId, 'provider_reference' => $a->reference, 'amount_minor' => $v->amount, 'currency' => $v->currency, 'channel' => $v->channel, 'verified_at' => CheckoutConfiguration::now(), 'applied_at' => $exception === null ? CheckoutConfiguration::now() : null, 'exception_code' => $exception, 'verification_source' => $source]);
                    $status = $exception === null ? 'SUCCEEDED' : 'REQUIRES_REVIEW';
                    $code = $exception ?? 'PAYMENT_APPLIED';
                    if ($exception === null) {
                        $this->orders->paymentUpdate($o, 'SUCCESSFUL', 'PAID');
                        DB::table('payment_events')->insert(['id' => (string) Str::uuid7(), 'order_id' => $o->id, 'attempt_id' => $a->id, 'event' => 'PaymentSucceeded', 'event_key' => 'payment-success:'.$o->id]);
                        $paymentState = 'SUCCESSFUL';
                    }
                }
            }
            // A stale failure/pending response never erases a previously verified receipt.
            if ($existing && $status !== 'REQUIRES_REVIEW') {
                $status = $existing->applied_at ? 'SUCCEEDED' : 'REQUIRES_REVIEW';
            }
            if ($old === 'REQUIRES_REVIEW') {
                $status = 'REQUIRES_REVIEW';
            }
            if ($status === 'REQUIRES_REVIEW') {
                $this->orders->paymentUpdate($o, 'REQUIRES_REVIEW', $o->status === 'PENDING_PAYMENT' ? 'PAYMENT_REVIEW' : null, true);
                DB::table('payment_events')->insertOrIgnore(['id' => (string) Str::uuid7(), 'order_id' => $o->id, 'attempt_id' => $a->id, 'event' => 'PaymentRequiresReview', 'event_key' => 'payment-review:'.$a->id]);
            } elseif ($o->status === 'PENDING_PAYMENT' && ! $o->financial_hold) {
                $activeOther = DB::table('payment_attempts')->where('order_id', $o->id)->where('id', '<>', $a->id)->whereIn('status', ['INITIALIZING', 'PENDING', 'UNKNOWN'])->exists();
                $paymentState = ! $activeOther && in_array($status, ['FAILED', 'ABANDONED'], true) ? $status : 'PENDING';
                $this->orders->paymentUpdate($o, $paymentState);
            }
            // A late observation of an old failed intent cannot create two active intents.
            if (in_array($status, ['PENDING', 'UNKNOWN'], true) && DB::table('payment_attempts')->where('order_id', $o->id)->where('id', '<>', $a->id)->whereIn('status', ['INITIALIZING', 'PENDING', 'UNKNOWN'])->exists()) {
                $status = 'REQUIRES_REVIEW';
                $code = 'PREVIOUS_ATTEMPT_UNCERTAIN';
                $this->orders->paymentUpdate($o, 'REQUIRES_REVIEW', $o->status === 'PENDING_PAYMENT' ? 'PAYMENT_REVIEW' : null, true);
            }
            $checks = $a->checks + 1;
            $retry = in_array($status, ['PENDING', 'UNKNOWN'], true) && $checks < (int) config('payments.max_checks');
            DB::table('payment_attempts')->where('id', $a->id)->update(['status' => $status, 'provider_status' => $v->state, 'checks' => $checks, 'last_checked_at' => now(), 'next_check_at' => $retry ? now()->addSeconds(max($v->retryAfter, min(3600, 30 * (2 ** min($checks, 7)))) + random_int(0, 20)) : null, 'lease_token' => null, 'lease_until' => null, 'failure_code' => $retry || $status === 'SUCCEEDED' ? null : ($checks >= (int) config('payments.max_checks') && in_array($status, ['PENDING', 'UNKNOWN'], true) ? 'RECONCILIATION_EXHAUSTED' : $code), 'updated_at' => now()]);
            $this->record($this->attempt($a->id), $source, $code, $old, $v->evidence(), $actor);
        }, 3);
    }

    /** @param array<string,mixed> $evidence */
    private function record(\stdClass $a, string $source, string $outcome, string $old, array $evidence, ?string $actor): void
    {
        DB::table('payment_reconciliation_records')->insert(['id' => (string) Str::uuid7(), 'attempt_id' => $a->id, 'source' => $source, 'outcome' => $outcome, 'previous_status' => $old, 'status' => $a->status, 'normalized' => json_encode($evidence, JSON_THROW_ON_ERROR), 'actor_user_id' => $actor]);
        $context = ['order_id' => $a->order_id, 'order_number' => Order::where('id', $a->order_id)->firstOrFail()->public_reference, 'attempt_id' => $a->id, 'reference' => $a->reference, 'outcome' => $outcome];
        DB::table('audit_logs')->insert(['id' => (string) Str::uuid7(), 'actor_user_id' => $actor, 'actor_type' => $actor ? 'user' : 'service', 'action' => 'payment.'.strtolower($outcome), 'subject_type' => 'payment_attempt', 'subject_id' => $a->id, 'outcome' => $a->status === 'REQUIRES_REVIEW' ? 'failure' : 'success', 'reason' => 'Payment observation', 'changes' => json_encode($context, JSON_THROW_ON_ERROR), 'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid7(), 'occurred_at' => now(), 'created_at' => now()]);
        Log::log($a->status === 'REQUIRES_REVIEW' || $a->failure_code === 'RECONCILIATION_EXHAUSTED' ? 'warning' : 'info', 'payment_observation', $context);
    }

    /** @return array<string,mixed> */
    public function projection(\stdClass $a, bool $redirect = false): array
    {
        $o = Order::where('id', $a->order_id)->firstOrFail();
        $data = ['id' => $a->id, 'reference' => $a->reference, 'method' => $a->method, 'amount_minor' => (string) $a->expected_amount_minor, 'currency' => $a->currency, 'status' => $a->status, 'created_at' => $a->created_at, 'last_checked_at' => $a->last_checked_at];
        if ($redirect) {
            $data['authorization_url'] = $a->authorization_url && $a->status === 'PENDING' && $o->status === 'PENDING_PAYMENT' && ! $o->financial_hold && $this->orders->projection($o, false)['reservation']['eligible'] ? Crypt::decryptString($a->authorization_url) : null;
        }

        return $data;
    }
}
