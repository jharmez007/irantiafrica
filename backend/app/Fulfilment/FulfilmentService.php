<?php

namespace App\Fulfilment;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Models\Order;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class FulfilmentService
{
    private function conflict(string $message): never
    {
        throw new CheckoutConflict('FULFILMENT_CONFLICT', $message);
    }

    private function eligible(Order $o): bool
    {
        return ! $o->financial_hold && $o->payment_state === 'SUCCESSFUL' && $this->paid($o);
    }

    private function paid(Order $o): bool
    {
        return $o->paid_at !== null
            && DB::table('payments')->where('order_id', $o->id)->whereNotNull('applied_at')->exists()
            && DB::table('reservations')->where('id', $o->current_reservation_id)->where('status', 'COMMITTED')->exists();
    }

    /** All commands lock actor → order → shipment. Inventory is read only.
     * @param  array<string,mixed>  $input
     */
    public function act(string $id, User $actor, string $action, array $input): Order
    {
        $permission = match ($action) {
            'processing' => 'orders.prepare', 'create', 'update', 'ship' => 'shipments.record', 'deliver' => 'delivery.record',
            default => throw new \LogicException('Unknown fulfilment command'),
        };

        return DB::transaction(function () use ($id, $actor, $action, $input, $permission): Order {
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->status === 'active' && $actor->hasPermission($permission), 403);
            $o = Order::whereKey($id)->lockForUpdate()->firstOrFail();
            $s = DB::table('shipments')->where('order_id', $id)->lockForUpdate()->first();
            $event = match ($action) {
                'processing' => 'OrderProcessingStarted', 'create' => 'ShipmentCreated', 'update' => 'ShipmentUpdated', 'ship' => 'OrderShipped', 'deliver' => 'OrderDelivered',
            };
            // A completed milestone replays without new audit, event, stock or notification effects.
            if (in_array($action, ['processing', 'ship', 'deliver'], true) && DB::table('fulfilment_events')->where('order_id', $id)->where('event', $event)->exists()) {
                return $o;
            }
            if ($action === 'create' && $s) {
                foreach (['provider_label', 'tracking_number', 'tracking_url', 'operational_notes'] as $key) {
                    if ($s->{$key} !== ($input[$key] ?? null)) {
                        $this->conflict('This order already has a shipment. Refresh before editing it.');
                    }
                }

                return $o;
            }
            if ($o->version !== $input['expected_version'] || $o->version === 2147483647) {
                $this->conflict('The order changed. Refresh before submitting again.');
            }
            $from = $o->status;
            $now = CheckoutConfiguration::now();
            $changes = ['version' => $o->version + 1];
            $note = $input['note'] ?? null;
            if ($action === 'processing') {
                if ($from !== 'PAID' || ! $this->eligible($o)) {
                    $this->conflict('Only a verified paid order without a financial hold can begin processing.');
                }
                $changes += ['status' => 'PROCESSING', 'processing_at' => $now];
            } elseif (in_array($action, ['create', 'update'], true)) {
                if ($from !== 'PROCESSING' || ! $this->eligible($o) || ($action === 'update' && (! $s || $s->status !== 'PREPARED'))) {
                    $this->conflict('Shipment details can only be prepared for an eligible processing order.');
                }
                if (isset($input['tracking_url']) && ! TrackingUrl::allowed($input['tracking_url'])) {
                    throw ValidationException::withMessages(['tracking_url' => 'Use an HTTPS tracking link on a configured approved carrier hostname.']);
                }
                $fields = array_intersect_key($input, array_flip(['provider_label', 'tracking_number', 'tracking_url', 'operational_notes']));
                if ($action === 'create') {
                    DB::table('shipments')->insert($fields + ['id' => (string) Str::uuid7(), 'order_id' => $id, 'status' => 'PREPARED', 'recorded_by' => $actor->id, 'created_at' => $now, 'updated_at' => $now]);
                } else {
                    DB::table('shipments')->where('id', $s->id)->update($fields + ['updated_at' => $now]);
                }
                $note = $input['operational_notes'] ?? null;
            } elseif ($action === 'ship') {
                if ($from !== 'PROCESSING' || ! $this->eligible($o) || ! $s || $s->status !== 'PREPARED' || ! $s->tracking_number || ! $s->tracking_url || ! TrackingUrl::allowed($s->tracking_url)) {
                    $this->conflict('Dispatch requires an eligible processing order, carrier, tracking number and approved HTTPS tracking link.');
                }
                DB::table('shipments')->where('id', $s->id)->update(['status' => 'SHIPPED', 'shipped_at' => $now, 'updated_at' => $now]);
                $changes['status'] = 'SHIPPED';
            } else {
                // Financial review cannot erase an already-dispatched delivery fact.
                if ($from !== 'SHIPPED' || ! $this->paid($o) || ! $s || $s->status !== 'SHIPPED') {
                    $this->conflict('Only an already shipped order can be confirmed delivered.');
                }
                DB::table('shipments')->where('id', $s->id)->update(['status' => 'DELIVERED', 'delivered_at' => $now, 'delivery_evidence' => $note, 'updated_at' => $now]);
                $changes['status'] = 'DELIVERED';
            }
            $o->forceFill($changes)->save();
            if ($o->status !== $from) {
                DB::table('order_status_history')->insert(['id' => (string) Str::uuid7(), 'order_id' => $id, 'from_status' => $from, 'to_status' => $o->status, 'actor_user_id' => $actor->id, 'source' => 'staff', 'reason' => $action === 'processing' ? ($note ?? 'Authorized manual fulfilment') : 'Authorized manual fulfilment', 'event' => $event, 'created_at' => $now]);
            }
            if ($action !== 'processing') {
                $next = DB::table('shipments')->where('order_id', $id)->firstOrFail();
                DB::table('shipment_status_history')->insert(['id' => (string) Str::uuid7(), 'shipment_id' => $next->id, 'order_id' => $id, 'from_status' => $s?->status, 'to_status' => $next->status, 'event' => $event, 'actor_user_id' => $actor->id, 'note' => $note, 'context' => json_encode(['changed_fields' => array_keys($input), 'previous_tracking_number' => $s?->tracking_number, 'tracking_number' => $next->tracking_number, 'previous_tracking_url' => $s?->tracking_url, 'tracking_url' => $next->tracking_url, 'provider_label' => $next->provider_label], JSON_THROW_ON_ERROR), 'created_at' => $now]);
            }
            if ($action !== 'update') {
                DB::table('fulfilment_events')->insert(['id' => (string) Str::uuid7(), 'order_id' => $id, 'event' => $event, 'created_at' => $now]);
            }
            DB::table('audit_logs')->insert(['id' => (string) Str::uuid7(), 'actor_user_id' => $actor->id, 'actor_type' => 'user', 'action' => 'fulfilment.'.$action, 'subject_type' => 'order', 'subject_id' => $id, 'outcome' => 'success', 'reason' => 'Authorized manual fulfilment', 'changes' => json_encode(['event' => $event, 'from' => $from, 'to' => $o->status, 'version' => $o->version], JSON_THROW_ON_ERROR), 'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid7(), 'occurred_at' => $now, 'created_at' => $now]);

            return $o->refresh();
        }, 3);
    }

    /** Safe customer/guest projection. Draft staff data stays private.
     * @return array<string,mixed>|null
     */
    public function projection(Order $o, bool $admin = false): ?array
    {
        $s = DB::table('shipments')->where('order_id', $o->id)->first();
        if (! $s || (! $admin && $s->status === 'PREPARED')) {
            return null;
        }

        return ['status' => $s->status, 'provider_label' => $s->provider_label, 'tracking_number' => $s->tracking_number,
            'tracking_url' => $s->tracking_url && TrackingUrl::allowed($s->tracking_url) ? $s->tracking_url : null,
            'shipped_at' => $s->shipped_at ? CarbonImmutable::parse($s->shipped_at)->toIso8601String() : null,
            'delivered_at' => $s->delivered_at ? CarbonImmutable::parse($s->delivered_at)->toIso8601String() : null]
            + ($admin ? ['id' => $s->id, 'operational_notes' => $s->operational_notes, 'delivery_evidence' => $s->delivery_evidence] : []);
    }

    /** @return array<string,mixed> */
    public function adminProjection(Order $o, User $actor): array
    {
        $shipment = $this->projection($o, true);
        $eligible = $this->eligible($o);

        return ['shipment' => $shipment, 'payment_verified' => $this->paid($o), 'blocked' => ! $eligible,
            'actions' => ['processing' => $eligible && $o->status === 'PAID' && $actor->hasPermission('orders.prepare'),
                'save' => $eligible && $o->status === 'PROCESSING' && $actor->hasPermission('shipments.record'),
                'ship' => $eligible && $o->status === 'PROCESSING' && $shipment && $shipment['tracking_number'] && $shipment['tracking_url'] && $actor->hasPermission('shipments.record'),
                'deliver' => $this->paid($o) && $o->status === 'SHIPPED' && $actor->hasPermission('delivery.record')]];
    }
}
