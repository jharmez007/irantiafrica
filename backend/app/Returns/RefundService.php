<?php

namespace App\Returns;

use App\Cart\CartMoney;
use App\Checkout\CheckoutConfiguration;
use App\Models\Order;
use App\Models\User;
use App\Payments\PaymentGateway;
use App\Payments\RefundVerification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class RefundService
{
    public function __construct(private PaymentGateway $gateway) {}

    /** Owner approval reserves budget; does not perform an external operation. */
    public function approve(string $returnId, User $user, int $version, string $reason): \stdClass
    {
        return DB::transaction(function () use ($returnId, $user, $version, $reason): \stdClass {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($user->status === 'active' && $user->hasPermission('refunds.approve'), 403);
            $initial = DB::table('return_requests')->where('id', $returnId)->firstOrFail();
            $o = Order::whereKey($initial->order_id)->lockForUpdate()->firstOrFail();
            $payment = DB::table('payments')->where('order_id', $o->id)->whereNotNull('applied_at')->lockForUpdate()->first();
            $r = DB::table('return_requests')->where('id', $returnId)->lockForUpdate()->firstOrFail();
            $existing = DB::table('refunds')->where('return_request_id', $returnId)->first();
            if ($existing) {
                return $existing;
            }
            $policy = json_decode(DB::table('return_policies')->where('id', $r->policy_version_id)->value('policy'), true);
            if (! $payment || $payment->currency !== 'NGN' || $o->financial_hold || $o->payment_state !== 'SUCCESSFUL' || $r->version !== $version || ! in_array($r->status, $policy['physical_receipt_required'] ? ['RECEIVED'] : ['APPROVED', 'RECEIVED'], true)) {
                ReturnService::conflict('Refund requires the current approved return, required physical receipt, verified payment and no financial hold.');
            }
            $units = DB::table('return_units')->join('return_items', 'return_items.id', '=', 'return_units.return_item_id')->where('return_items.return_request_id', $returnId)->where('return_units.active', true)->orderBy('return_units.order_item_id')->orderBy('unit_number')->select('return_units.*')->get();
            $amount = 0;
            $allocation = [];
            foreach ($units as $unit) {
                $amount = CartMoney::add($amount, CartMoney::add((int) $unit->base_minor, (int) $unit->tax_minor));
                $allocation[] = ['unit_id' => $unit->id, 'order_item_id' => $unit->order_item_id, 'unit_number' => $unit->unit_number, 'base_minor' => (string) $unit->base_minor, 'tax_minor' => (string) $unit->tax_minor];
            }
            $reserved = (int) DB::table('refunds')->where('payment_id', $payment->id)->where('status', '<>', 'FAILED')->sum('amount_minor');
            if ($amount < 1 || $amount > (int) $payment->amount_minor - $reserved) {
                ReturnService::conflict('Refund exceeds remaining captured budget.');
            }
            $id = (string) Str::uuid7();
            DB::table('refunds')->insert(['id' => $id, 'order_id' => $o->id, 'payment_id' => $payment->id, 'return_request_id' => $returnId, 'merchant_reference' => 'IRA-R-'.bin2hex(random_bytes(18)), 'amount_minor' => $amount, 'currency' => 'NGN', 'allocation_snapshot' => json_encode(['units' => $allocation, 'delivery_minor' => '0', 'delivery_tax_minor' => '0'], JSON_THROW_ON_ERROR), 'approved_by' => $user->id, 'reason' => $reason, 'status' => 'APPROVED']);
            $refund = DB::table('refunds')->where('id', $id)->firstOrFail();
            $this->history($refund, null, 'approval', $user->id);
            ReturnService::audit('RefundApproved', 'refund', $id, $user->id, ['amount_minor' => (string) $amount]);

            return $refund;
        }, 3);
    }

    public function submit(string $id, User $user): \stdClass
    {
        abort_unless($this->gateway->refundsReady(), 503, 'Refund provider is not configured.');
        $intent = DB::transaction(function () use ($id, $user): ?\stdClass {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($user->status === 'active' && $user->hasPermission('refunds.submit'), 403);
            $initial = DB::table('refunds')->where('id', $id)->firstOrFail();
            $o = Order::whereKey($initial->order_id)->lockForUpdate()->firstOrFail();
            DB::table('payments')->where('id', $initial->payment_id)->lockForUpdate()->firstOrFail();
            $r = DB::table('refunds')->where('id', $id)->lockForUpdate()->firstOrFail();
            if ($r->status !== 'APPROVED') {
                return null;
            }
            if ($o->financial_hold || $o->payment_state !== 'SUCCESSFUL') {
                ReturnService::conflict('Resolve financial review before refund submission.');
            }
            $payment = DB::table('payments')->where('id', $r->payment_id)->firstOrFail();
            DB::table('refund_attempts')->insert(['id' => (string) Str::uuid7(), 'refund_id' => $id, 'amount_minor' => $r->amount_minor, 'payment_reference' => $payment->provider_reference]);
            $token = (string) Str::uuid();
            DB::table('refunds')->where('id', $id)->update(['status' => 'SUBMITTING', 'submitted_at' => CheckoutConfiguration::now(), 'lease_token' => $token, 'lease_until' => now()->addSeconds(45), 'next_check_at' => now()->addSeconds(60)]);
            $r->status = 'SUBMITTING';
            $r->lease_token = $token;
            $r->transaction_reference = $payment->provider_reference;
            $this->history($r, 'APPROVED', 'submit', $user->id);
            $this->event($r, 'RefundInitiated', $user->id);

            return $r;
        }, 3);
        if ($intent) {
            $observation = $this->gateway->refundPayment($intent->transaction_reference, (string) $intent->amount_minor, $intent->merchant_reference);
            // Creation response establishes a candidate ID; completion always requires a fresh GET.
            if ($observation->providerId) {
                $candidate = $observation;
                $observation = $this->gateway->verifyRefund($observation->providerId);
                if ($observation->providerId === null) {
                    $observation = new RefundVerification('UNKNOWN', $candidate->providerId, $candidate->transactionId, $candidate->amount, $candidate->currency, $candidate->merchantReference, $candidate->mode);
                }
            }
            $this->finalize($id, $intent->lease_token, $observation, 'submit', $user->id);
        }

        return DB::table('refunds')->where('id', $id)->firstOrFail();
    }

    public function verify(string $id, string $source = 'scheduler', ?string $candidate = null, ?string $actor = null): bool
    {
        if (! $this->gateway->refundsReady()) {
            return false;
        }
        $r = DB::transaction(function () use ($id, $source, $candidate): ?\stdClass {
            $initial = DB::table('refunds')->where('id', $id)->firstOrFail();
            Order::whereKey($initial->order_id)->lockForUpdate()->firstOrFail();
            $r = DB::table('refunds')->where('id', $id)->lockForUpdate()->firstOrFail();
            if (in_array($r->status, ['APPROVED', 'SUCCEEDED', 'FAILED'], true) || ($r->lease_until && CheckoutConfiguration::now()->lt($r->lease_until)) || ($source === 'scheduler' && ($r->checks >= config('refunds.max_checks') || ($r->next_check_at && CheckoutConfiguration::now()->lt($r->next_check_at))))) {
                return null;
            }
            $r->lease_token = (string) Str::uuid();
            $r->candidate = $r->provider_refund_id ?? $candidate;
            DB::table('refunds')->where('id', $id)->update(['lease_token' => $r->lease_token, 'lease_until' => now()->addSeconds(45)]);

            return $r;
        }, 3);
        if (! $r) {
            return true;
        }
        $observation = $r->candidate ? $this->gateway->verifyRefund($r->candidate) : new RefundVerification('UNKNOWN');
        $this->finalize($id, $r->lease_token, $observation, $source, $actor);

        return true;
    }

    public function finalize(string $id, string $token, RefundVerification $v, string $source, ?string $actor = null): void
    {
        DB::transaction(function () use ($id, $token, $v, $source, $actor): void {
            $initial = DB::table('refunds')->where('id', $id)->firstOrFail();
            Order::whereKey($initial->order_id)->lockForUpdate()->firstOrFail();
            $payment = DB::table('payments')->where('id', $initial->payment_id)->lockForUpdate()->firstOrFail();
            $r = DB::table('refunds')->where('id', $id)->lockForUpdate()->firstOrFail();
            if ($r->lease_token !== $token || in_array($r->status, ['SUCCEEDED', 'FAILED'], true)) {
                return;
            }
            $match = $v->providerId !== null && $v->transactionId === $payment->provider_transaction_id && $v->amount === (string) $r->amount_minor && $v->currency === 'NGN' && $v->merchantReference === $r->merchant_reference && $v->mode === config('payments.mode') && ($r->provider_refund_id === null || $r->provider_refund_id === $v->providerId);
            if ($match && DB::table('refunds')->where('provider_refund_id', $v->providerId)->where('id', '<>', $id)->exists()) {
                $match = false;
            }
            $state = $match && in_array($v->state, ['SUCCEEDED', 'FAILED', 'PENDING'], true) ? $v->state : 'UNKNOWN';
            $from = $r->status;
            DB::table('refunds')->where('id', $id)->update(['status' => $state, 'provider_refund_id' => $match ? $v->providerId : $r->provider_refund_id, 'completed_at' => in_array($state, ['SUCCEEDED', 'FAILED'], true) ? CheckoutConfiguration::now() : null, 'lease_token' => null, 'lease_until' => null, 'checks' => $r->checks + 1, 'error_code' => $state === 'UNKNOWN' ? 'REFUND_REVIEW_REQUIRED' : null, 'next_check_at' => in_array($state, ['SUCCEEDED', 'FAILED'], true) ? null : now()->addMinutes(min(60, 2 ** min($r->checks, 6))), 'updated_at' => CheckoutConfiguration::now()]);
            $r = DB::table('refunds')->where('id', $id)->firstOrFail();
            $this->history($r, $from, $source, $actor);
            if (in_array($state, ['SUCCEEDED', 'FAILED'], true)) {
                $this->event($r, $state === 'SUCCEEDED' ? 'RefundSucceeded' : 'RefundFailed', $actor);
            }
            if ($state === 'SUCCEEDED') {
                $ret = DB::table('return_requests')->where('id', $r->return_request_id)->lockForUpdate()->firstOrFail();
                if ($ret->status !== 'CLOSED') {
                    DB::table('return_requests')->where('id', $ret->id)->update(['status' => 'CLOSED', 'version' => $ret->version + 1, 'updated_at' => CheckoutConfiguration::now()]);
                    $updated = DB::table('return_requests')->where('id', $ret->id)->firstOrFail();
                    ReturnService::event($updated, 'ReturnClosed', $ret->status, $actor);
                }
            }
        }, 3);
    }

    private function history(\stdClass $r, ?string $from, string $source, ?string $actor): void
    {
        DB::table('refund_status_history')->insert(['id' => (string) Str::uuid7(), 'refund_id' => $r->id, 'from_status' => $from, 'to_status' => $r->status, 'source' => $source, 'actor_user_id' => $actor, 'normalized' => json_encode(['provider_refund_id' => $r->provider_refund_id, 'error_code' => $r->error_code], JSON_THROW_ON_ERROR)]);
    }

    private function event(\stdClass $r, string $event, ?string $actor): void
    {
        DB::table('return_events')->insertOrIgnore(['id' => (string) Str::uuid7(), 'return_request_id' => $r->return_request_id, 'event' => $event, 'event_key' => $r->id.':'.$event]);
        ReturnService::audit($event, 'refund', $r->id, $actor, ['amount_minor' => (string) $r->amount_minor, 'status' => $r->status]);
    }
}
