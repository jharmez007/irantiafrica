<?php

namespace App\Returns;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Checkout\TaxMath;
use App\Inventory\InventoryService;
use App\Models\Order;
use App\Models\User;
use App\Orders\OrderService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ReturnService
{
    public function __construct(private OrderService $orders, private ReturnPolicy $policies) {}

    public static function conflict(string $message): never
    {
        throw new CheckoutConflict('RETURN_CONFLICT', $message);
    }

    /** @param array<string,mixed> $context */
    public static function audit(string $action, string $type, string $id, ?string $actor, array $context): void
    {
        DB::table('audit_logs')->insert(['id' => (string) Str::uuid7(), 'actor_user_id' => $actor, 'actor_type' => $actor ? 'user' : ($action === 'ReturnRequested' ? 'guest' : 'service'), 'action' => 'return.'.$action, 'subject_type' => $type, 'subject_id' => $id, 'outcome' => 'success', 'reason' => 'Post-purchase resolution', 'changes' => json_encode($context, JSON_THROW_ON_ERROR), 'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid7(), 'occurred_at' => now(), 'created_at' => now()]);
    }

    /** @param array<string,mixed> $context */
    public static function event(\stdClass $r, string $event, ?string $from, ?string $actor, ?string $note = null, array $context = []): void
    {
        DB::table('return_status_history')->insert(['id' => (string) Str::uuid7(), 'return_request_id' => $r->id, 'event' => $event, 'from_status' => $from, 'to_status' => $r->status, 'actor_user_id' => $actor, 'note' => $note, 'context' => json_encode($context, JSON_THROW_ON_ERROR)]);
        DB::table('return_events')->insert(['id' => (string) Str::uuid7(), 'return_request_id' => $r->id, 'event' => $event, 'event_key' => $r->id.':'.$r->version.':'.$event]);
        self::audit($event, 'return', $r->id, $actor, ['version' => $r->version, 'from' => $from, 'to' => $r->status]);
    }

    /** @param array<string,mixed> $input */
    public function create(string $orderId, ?User $user, ?string $token, array $input, string $key): \stdClass
    {
        return DB::transaction(function () use ($orderId, $user, $token, $input, $key): \stdClass {
            if ($user) {
                $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                abort_unless($user->status === 'active', 401);
            }
            $o = Order::whereKey($orderId)->lockForUpdate()->firstOrFail();
            $this->orders->owned($orderId, $user, $token);
            $items = $input['items'];
            usort($items, fn ($a, $b) => strcmp($a['order_item_id'], $b['order_item_id']));
            $hash = hash('sha256', json_encode([$input['reason_code'], $input['explanation'] ?? null, $items], JSON_THROW_ON_ERROR));
            $previous = DB::table('return_requests')->where('order_id', $orderId)->where('request_key', $key)->first();
            if ($previous) {
                if (! hash_equals($previous->request_hash, $hash)) {
                    self::conflict('This request key was used with different input.');
                }

                return $previous;
            }
            $policy = $this->policies->current();
            $evaluation = $this->policies->evaluate($o, $policy);
            if (! $evaluation['eligible'] || ! $policy) {
                self::conflict($evaluation['reason']);
            }
            $id = (string) Str::uuid7();
            DB::table('return_requests')->insert(['id' => $id, 'order_id' => $orderId, 'requested_by' => $o->user_id, 'policy_version_id' => $policy->id, 'request_key' => $key, 'request_hash' => $hash, 'status' => 'SUBMITTED', 'reason_code' => $input['reason_code'], 'customer_note' => $input['explanation'] ?? null, 'anchor_at' => $evaluation['anchor'], 'cutoff_at' => $evaluation['cutoff'], 'submitted_at' => CheckoutConfiguration::now()]);
            foreach ($items as $item) {
                $line = DB::table('order_items')->where('id', $item['order_item_id'])->where('order_id', $orderId)->lockForUpdate()->first();
                if (! $line) {
                    self::conflict('Select an item from this order.');
                }
                $claimed = DB::table('return_units')->where('order_item_id', $line->id)->where('active', true)->pluck('unit_number')->all();
                $available = array_values(array_diff(range(1, $line->quantity), $claimed));
                if ($item['quantity'] > count($available)) {
                    self::conflict('Requested quantity overlaps an existing return or exceeds the purchased quantity.');
                }
                $itemId = (string) Str::uuid7();
                DB::table('return_items')->insert(['id' => $itemId, 'return_request_id' => $id, 'order_id' => $orderId, 'order_item_id' => $line->id, 'quantity' => $item['quantity']]);
                $tax = TaxMath::allocation((int) $line->tax_minor, $line->quantity);
                foreach (array_slice($available, 0, $item['quantity']) as $unit) {
                    DB::table('return_units')->insert(['id' => (string) Str::uuid7(), 'return_item_id' => $itemId, 'order_item_id' => $line->id, 'unit_number' => $unit, 'base_minor' => $line->unit_price_minor, 'tax_minor' => (int) $tax['base_minor'] + ($unit <= $tax['extra_units'] ? 1 : 0)]);
                }
            }
            $r = DB::table('return_requests')->where('id', $id)->firstOrFail();
            self::event($r, 'ReturnRequested', null, $user?->id);

            return $r;
        }, 3);
    }

    /** @param array<string,mixed> $input */
    public function act(string $id, User $user, string $action, array $input): \stdClass
    {
        return DB::transaction(function () use ($id, $user, $action, $input): \stdClass {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $permission = match ($action) {
                'review', 'receive' => 'returns.review', 'approve', 'reject', 'inspect' => 'returns.decide', 'restock' => 'inventory.adjust', default => throw new \LogicException('Unknown return action')
            };
            abort_unless($user->status === 'active' && $user->hasPermission($permission), 403);
            $initial = DB::table('return_requests')->where('id', $id)->firstOrFail();
            Order::whereKey($initial->order_id)->lockForUpdate()->firstOrFail();
            $r = DB::table('return_requests')->where('id', $id)->lockForUpdate()->firstOrFail();
            $items = DB::table('return_items')->where('return_request_id', $id)->orderBy('order_item_id')->lockForUpdate()->get();
            $event = match ($action) {
                'review' => 'ReturnReviewStarted', 'approve' => 'ReturnApproved', 'reject' => 'ReturnRejected', 'receive' => 'ReturnReceived', 'inspect' => 'ReturnInspected', 'restock' => 'ReturnRestocked'
            };
            if (DB::table('return_status_history')->where('return_request_id', $id)->where('event', $event)->exists()) {
                return $r;
            }
            if ($r->version !== $input['expected_version'] || $r->version === 2147483647) {
                self::conflict('Return changed. Refresh before submitting.');
            }
            $from = $r->status;
            $changes = ['version' => $r->version + 1, 'updated_at' => CheckoutConfiguration::now()];
            if (in_array($action, ['review', 'approve', 'reject'], true)) {
                if (! in_array($r->status, ['SUBMITTED', 'UNDER_REVIEW'], true)) {
                    self::conflict('This return already has a final decision.');
                }
                $changes['status'] = match ($action) {
                    'review' => 'UNDER_REVIEW', 'approve' => 'APPROVED', 'reject' => 'REJECTED'
                };
                if ($action !== 'review') {
                    $changes += ['decided_by' => $user->id, 'decided_at' => CheckoutConfiguration::now(), 'decision_reason' => $input['note']];
                    $quantities = array_column($input['items'] ?? [], 'quantity', 'return_item_id');
                    if ($action === 'approve' && (count($quantities) !== $items->count() || array_sum($quantities) < 1)) {
                        self::conflict('Review every requested line and approve at least one unit.');
                    }
                    foreach ($items as $item) {
                        $qty = $action === 'reject' ? 0 : ($quantities[$item->id] ?? -1);
                        if ($qty < 0 || $qty > $item->quantity) {
                            self::conflict('Approved quantity must be within the requested quantity.');
                        }
                        DB::table('return_items')->where('id', $item->id)->update(['approved_quantity' => $qty]);
                        $keep = DB::table('return_units')->where('return_item_id', $item->id)->orderBy('unit_number')->limit($qty)->pluck('id')->all();
                        DB::table('return_units')->where('return_item_id', $item->id)->whereNotIn('id', $keep)->update(['active' => false]);
                    }
                }
            } elseif ($action === 'receive') {
                if (! in_array($r->status, ['APPROVED', 'CLOSED'], true)) {
                    self::conflict('Physical receipt requires an approved return.');
                }
                foreach ($items as $item) {
                    DB::table('return_items')->where('id', $item->id)->update(['received_quantity' => $item->approved_quantity]);
                }
                $changes['status'] = $r->status === 'CLOSED' ? 'CLOSED' : 'RECEIVED';
            } elseif ($action === 'inspect') {
                if (! in_array($r->status, ['RECEIVED', 'CLOSED'], true)) {
                    self::conflict('Receive goods before recording their inspection.');
                }
                $decisions = array_column($input['items'], 'disposition', 'return_item_id');
                if (count($decisions) !== $items->where('approved_quantity', '>', 0)->count()) {
                    self::conflict('Inspect every approved return line.');
                }
                foreach ($items as $item) {
                    if ($item->approved_quantity === 0) {
                        continue;
                    }
                    if (! isset($decisions[$item->id]) || $item->received_quantity !== $item->approved_quantity) {
                        self::conflict('Every approved unit must be physically received before inspection.');
                    }
                    DB::table('return_items')->where('id', $item->id)->update(['disposition' => $decisions[$item->id], 'inspected_by' => $user->id, 'inspected_at' => CheckoutConfiguration::now(), 'inspection_note' => $input['note']]);
                }
            } else {
                if (! in_array($r->status, ['RECEIVED', 'CLOSED'], true) || ! $items->contains('disposition', 'SALEABLE')) {
                    self::conflict('Receive and inspect saleable goods before restocking.');
                }
                foreach ($items->sortBy('order_item_id') as $item) {
                    if ($item->approved_quantity > 0 && ! $item->inspected_at) {
                        self::conflict('Inspect received goods before restocking.');
                    }
                    if ($item->disposition === 'SALEABLE' && $item->received_quantity > 0) {
                        app(InventoryService::class)->restockReturn($item->id, $user);
                    }
                }
            }
            DB::table('return_requests')->where('id', $id)->update($changes);
            $r = DB::table('return_requests')->where('id', $id)->firstOrFail();
            self::event($r, $event, $from, $user->id, $input['note'] ?? null);

            return $r;
        }, 3);
    }

    /** @return array<string,mixed> */
    public function projection(\stdClass $r, ?User $staff = null): array
    {
        $items = DB::table('return_items')->where('return_request_id', $r->id)->get()->map(function ($i): array {
            $l = DB::table('order_items')->where('id', $i->order_item_id)->firstOrFail();

            return ['id' => $i->id, 'order_item_id' => $i->order_item_id, 'name' => json_decode($l->snapshot, true)['name'], 'quantity' => $i->quantity, 'approved_quantity' => $i->approved_quantity, 'received_quantity' => $i->received_quantity, 'restocked_quantity' => $i->restocked_quantity, 'disposition' => $i->disposition];
        })->all();
        $refund = DB::table('refunds')->where('return_request_id', $r->id)->first();
        $data = ['id' => $r->id, 'order_id' => $r->order_id, 'requester' => $r->requested_by ? 'account' : 'guest', 'status' => $r->status, 'version' => $r->version, 'reason_code' => $r->reason_code, 'explanation' => $r->customer_note, 'submitted_at' => $r->submitted_at, 'cutoff_at' => $r->cutoff_at, 'decision_reason' => $r->decision_reason, 'items' => $items,
            'history' => DB::table('return_status_history')->where('return_request_id', $r->id)->orderBy('created_at')->orderBy('id')->get()->map(fn ($h) => ['event' => $h->event, 'status' => $h->to_status, 'at' => $h->created_at])->all(),
            'refund' => $refund ? ['id' => $refund->id, 'status' => $refund->status, 'amount_minor' => (string) $refund->amount_minor, 'currency' => 'NGN'] : null];
        if ($staff) {
            $policy = json_decode(DB::table('return_policies')->where('id', $r->policy_version_id)->value('policy'), true);
            $o = Order::whereKey($r->order_id)->firstOrFail();
            $captured = (int) DB::table('payments')->where('order_id', $o->id)->whereNotNull('applied_at')->sum('amount_minor');
            $succeeded = (int) DB::table('refunds')->where('order_id', $o->id)->where('status', 'SUCCEEDED')->sum('amount_minor');
            $reserved = (int) DB::table('refunds')->where('order_id', $o->id)->whereNotIn('status', ['FAILED', 'SUCCEEDED'])->sum('amount_minor');
            $data['payment_summary'] = ['state' => $o->payment_state, 'financial_hold' => $o->financial_hold, 'captured_minor' => (string) $captured, 'refunded_minor' => (string) $succeeded, 'reserved_minor' => (string) $reserved, 'net_minor' => (string) ($captured - $succeeded)];
            $data['refund_actions'] = ['submit' => $staff->hasPermission('refunds.submit') && $refund?->status === 'APPROVED' && ! $o->financial_hold, 'reconcile' => $staff->hasPermission('refunds.submit') && $refund && in_array($refund->status, ['SUBMITTING', 'PENDING', 'UNKNOWN'], true)];
            $data['actions'] = ['review' => $staff->hasPermission('returns.review') && $r->status === 'SUBMITTED', 'approve' => $staff->hasPermission('returns.decide') && in_array($r->status, ['SUBMITTED', 'UNDER_REVIEW'], true), 'reject' => $staff->hasPermission('returns.decide') && in_array($r->status, ['SUBMITTED', 'UNDER_REVIEW'], true), 'receive' => $staff->hasPermission('returns.review') && in_array($r->status, ['APPROVED', 'CLOSED'], true) && ! DB::table('return_status_history')->where('return_request_id', $r->id)->where('event', 'ReturnReceived')->exists(), 'inspect' => $staff->hasPermission('returns.decide') && in_array($r->status, ['RECEIVED', 'CLOSED'], true) && DB::table('return_status_history')->where('return_request_id', $r->id)->where('event', 'ReturnReceived')->exists() && ! DB::table('return_items')->where('return_request_id', $r->id)->whereNotNull('inspected_at')->exists(), 'restock' => $staff->hasPermission('inventory.adjust') && DB::table('return_items')->where('return_request_id', $r->id)->where('disposition', 'SALEABLE')->where('restocked_quantity', 0)->exists(), 'refund' => $staff->hasPermission('refunds.approve') && ! $refund && ! $o->financial_hold && $o->payment_state === 'SUCCESSFUL' && in_array($r->status, $policy['physical_receipt_required'] ? ['RECEIVED'] : ['APPROVED', 'RECEIVED'], true)];
            $data['history'] = DB::table('return_status_history')->where('return_request_id', $r->id)->orderBy('created_at')->orderBy('id')->get()->all();
        }

        return $data;
    }
}
