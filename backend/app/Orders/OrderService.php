<?php

namespace App\Orders;

use App\Cart\CartMoney;
use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Checkout\CheckoutService;
use App\Fulfilment\FulfilmentService;
use App\Inventory\InventoryService;
use App\Models\CheckoutSession;
use App\Models\Order;
use App\Models\Reservation;
use App\Models\User;
use App\Payments\PaymentGateway;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class OrderService
{
    public function __construct(private CheckoutService $checkouts, private InventoryService $stock) {}

    /** @param array<string,mixed> $data */
    public function createFromCheckout(?User $user, ?string $checkoutToken, array $data, string $key): Order
    {
        return $this->checkouts->promote($data['checkout_id'], $user, $checkoutToken, $data,
            function (CheckoutSession $s) use ($data, $key): Order {
                $hash = hash('sha256', json_encode([$data['checkout_id'], $data['expected_version'], $data['fingerprint']], JSON_THROW_ON_ERROR));
                $scope = hash('sha256', $s->user_id ? 'user:'.$s->user_id : 'guest:'.$s->guest_token_hash);
                $previous = Order::where('creation_scope', $scope)->where('creation_key', $key)->first();
                if ($previous && ($previous->checkout_id !== $s->id || ! hash_equals($previous->creation_hash, $hash))) {
                    throw new CheckoutConflict('IDEMPOTENCY_CONFLICT', 'This order retry key was used with different input.');
                }
                $existing = Order::where('checkout_id', $s->id)->lockForUpdate()->first();
                if ($existing) {
                    if (! hash_equals($existing->creation_hash, $hash)) {
                        throw new CheckoutConflict('IDEMPOTENCY_CONFLICT', 'This checkout already created an order from different confirmation input.');
                    }

                    return $existing;
                }

                return $this->copy($s, $key, $scope, $hash);
            });
    }

    private function copy(CheckoutSession $s, string $key, string $scope, string $hash): Order
    {
        $r = Reservation::findOrFail($s->current_reservation_id ?? throw new CheckoutConflict('ORDER_RESERVATION_INELIGIBLE', 'A reservation is required.'));
        if ($r->status !== 'ACTIVE' || $r->expires_at->lte(CheckoutConfiguration::now()) || $r->reference_id !== $s->inventory_reference_id) {
            throw new CheckoutConflict('ORDER_RESERVATION_INELIGIBLE', 'An active matching reservation is required.');
        }
        $lines = DB::table('checkout_lines')->where('checkout_id', $s->id)->orderBy('variant_id')->get();
        $held = DB::table('reservation_items')->where('reservation_id', $r->id)->orderBy('variant_id')->pluck('quantity', 'variant_id')->all();
        $requested = $lines->pluck('quantity', 'variant_id')->all();
        if ($held !== $requested || $lines->isEmpty()) {
            throw new CheckoutConflict('ORDER_RESERVATION_MISMATCH', 'The reservation does not match every checkout item.');
        }
        $subtotal = 0;
        $productTax = 0;
        foreach ($lines as $line) {
            $tax = json_decode($line->tax_snapshot ?? 'null', true);
            if (! is_array($tax) || $tax['configuration_id'] !== $s->configuration_id || $tax['taxable_base_minor'] !== (string) $line->line_subtotal_minor) {
                throw new CheckoutConflict('ORDER_TOTAL_MISMATCH', 'Checkout calculation is incomplete.');
            }
            $base = CartMoney::line((string) $line->unit_price_minor, $line->quantity);
            if ((string) $base !== (string) $line->line_subtotal_minor) {
                throw new CheckoutConflict('ORDER_TOTAL_MISMATCH', 'Checkout line totals do not match.');
            }
            $subtotal = CartMoney::add($subtotal, $base);
            $productTax = CartMoney::add($productTax, CartMoney::line($tax['tax_minor'], 1));
        }
        $calc = $s->calculation ?? throw new CheckoutConflict('ORDER_TOTAL_MISMATCH', 'Checkout calculation is missing.');
        $deliveryTax = CartMoney::line($calc['delivery_tax_minor'], 1);
        $tax = CartMoney::add($productTax, $deliveryTax);
        $total = CartMoney::add(CartMoney::add($subtotal, $tax), CartMoney::line($s->delivery_minor ?? throw new CheckoutConflict('ORDER_TOTAL_MISMATCH', 'Delivery is missing.'), 1));
        if ((string) $subtotal !== $s->subtotal_minor || (string) $productTax !== $calc['product_tax_minor'] || (string) $tax !== $s->tax_minor || (string) $total !== $s->total_minor) {
            throw new CheckoutConflict('ORDER_TOTAL_MISMATCH', 'Checkout totals do not match their complete item snapshots.');
        }
        $contact = DB::table('checkout_addresses')->where('checkout_id', $s->id)->firstOrFail();
        $ttl = config('orders.guest_access_seconds');
        if (! is_int($ttl) || $ttl < 1 || $ttl > 604800) {
            throw new \LogicException('Order guest access lifetime must be 1..604800 seconds.');
        }
        $o = new Order;
        $o->forceFill(['public_reference' => 'IRA-'.strtoupper(bin2hex(random_bytes(10))), 'checkout_id' => $s->id, 'user_id' => $s->user_id,
            'source_cart_id' => $s->source_cart_id, 'source_cart_version' => $s->cart_version, 'inventory_reference_id' => $s->inventory_reference_id, 'current_reservation_id' => $r->id,
            'contact_email' => $contact->email, 'status' => 'PENDING_PAYMENT', 'payment_state' => 'NOT_STARTED', 'version' => 1, 'currency' => 'NGN',
            'subtotal_minor' => $s->subtotal_minor, 'product_tax_minor' => (string) $productTax, 'delivery_minor' => $s->delivery_minor, 'delivery_tax_minor' => (string) $deliveryTax,
            'tax_minor' => $s->tax_minor, 'total_minor' => $s->total_minor, 'calculation' => $calc, 'configuration_id' => $s->configuration_id, 'fingerprint' => $s->fingerprint,
            'creation_scope' => $scope, 'creation_key' => $key, 'creation_hash' => $hash,
            'guest_token_hash' => $s->user_id ? null : hash('sha256', $this->token($scope, $key)),
            'guest_expires_at' => $s->user_id ? null : CheckoutConfiguration::now()->addSeconds($ttl)])->save();
        foreach ($lines as $line) {
            $ts = json_decode($line->tax_snapshot, true);
            DB::table('order_items')->insert(['id' => (string) Str::uuid(), 'order_id' => $o->id, 'variant_id' => $line->variant_id, 'quantity' => $line->quantity,
                'unit_price_minor' => $line->unit_price_minor, 'line_subtotal_minor' => $line->line_subtotal_minor, 'tax_minor' => $ts['tax_minor'],
                'line_total_minor' => (string) CartMoney::add((int) $line->line_subtotal_minor, CartMoney::line($ts['tax_minor'], 1)),
                'snapshot' => $line->snapshot, 'tax_snapshot' => $line->tax_snapshot]);
        }
        DB::table('order_addresses')->insert(['id' => (string) Str::uuid(), 'order_id' => $o->id, 'address' => $contact->address]);
        $this->history($o, null, $s->user_id ? 'customer' : 'guest', $s->user_id, 'Reviewed checkout promoted', 'OrderCreated');

        return $o->refresh();
    }

    private function token(string $scope, string $key): string
    {
        return hash_hmac('sha256', 'order:'.$scope.':'.$key, (string) config('app.key'));
    }

    /** Only called after authorized placement/replay. No grant is renewed here. */
    public function placementGrant(Order $o): ?string
    {
        return $o->user_id === null && $o->guest_expires_at?->gt(CheckoutConfiguration::now()) ? $this->token($o->creation_scope, $o->creation_key) : null;
    }

    public function cancelUnpaid(string $id, ?User $user, ?string $token, int $version, string $reason, bool $admin = false): Order
    {
        return DB::transaction(function () use ($id, $user, $token, $version, $reason, $admin): Order {
            if ($user) {
                $user = User::where('id', $user->id)->lockForUpdate()->firstOrFail();
                abort_unless($user->status === 'active', 401);
            }
            if ($admin) {
                abort_unless($user?->hasPermission('orders.cancel') ?? false, 403);
            } else {
                $this->owned($id, $user, $token);
            }
            $o = Order::where('id', $id)->lockForUpdate()->firstOrFail();
            if ($o->status === 'CANCELLED') {
                return $o;
            }
            if ($o->version !== $version || $o->status !== 'PENDING_PAYMENT' || $o->payment_state !== 'NOT_STARTED') {
                throw new CheckoutConflict('ORDER_CANCELLATION_INELIGIBLE', 'Refresh the order. Only an unchanged unpaid order with no payment activity can be cancelled.');
            }
            if ($o->version === 2147483647) {
                throw new CheckoutConflict('ORDER_VERSION_LIMIT', 'Order requires maintenance.');
            }
            $r = $this->stock->release($o->current_reservation_id)->reservation;
            if ($r->status === 'COMMITTED') {
                throw new CheckoutConflict('ORDER_CANCELLATION_INELIGIBLE', 'Consumed inventory requires separate review.');
            }
            $o->forceFill(['status' => 'CANCELLED', 'version' => $o->version + 1, 'cancelled_at' => CheckoutConfiguration::now()])->save();
            $this->history($o, 'PENDING_PAYMENT', $admin ? 'owner' : ($o->user_id ? 'customer' : 'guest'), $user?->id, $reason, 'OrderCancelled');

            return $o->refresh();
        }, 3);
    }

    public function owned(string $id, ?User $user, ?string $token): Order
    {
        $o = Order::findOrFail($id);
        $allowed = $o->user_id !== null ? $user?->id === $o->user_id : ($token !== null && $o->guest_expires_at?->gt(CheckoutConfiguration::now()) && hash_equals($o->guest_token_hash ?? '', hash('sha256', $token)));
        abort_unless($allowed, 404);

        return $o;
    }

    public function read(Order $order): Order
    {
        return DB::transaction(function () use ($order): Order {
            $o = Order::where('id', $order->id)->lockForUpdate()->firstOrFail();
            $this->stock->expire($o->current_reservation_id);

            return $o;
        }, 3);
    }

    /** @return array<string,mixed> */
    public function projection(Order $o, bool $detail = true, bool $canCancel = false): array
    {
        $r = Reservation::findOrFail($o->current_reservation_id);
        $active = $r->status === 'ACTIVE' && $r->expires_at->gt(CheckoutConfiguration::now());
        $data = ['id' => $o->id, 'number' => $o->public_reference, 'ownership' => $o->user_id ? 'account' : 'guest', 'status' => $o->status, 'version' => $o->version,
            'created_at' => $o->created_at->toIso8601String(), 'cancelled_at' => $o->cancelled_at?->toIso8601String(), 'currency' => 'NGN', 'subtotal_minor' => $o->subtotal_minor,
            'product_tax_minor' => $o->product_tax_minor, 'delivery_minor' => $o->delivery_minor, 'delivery_tax_minor' => $o->delivery_tax_minor, 'tax_minor' => $o->tax_minor, 'total_minor' => $o->total_minor,
            'payment' => ['state' => $o->payment_state, 'available' => app(PaymentGateway::class)->ready() && $active && $o->status === 'PENDING_PAYMENT' && ! $o->financial_hold],
            'reservation' => ['status' => $r->status === 'ACTIVE' && ! $active ? 'EXPIRED' : $r->status, 'expires_at' => $r->expires_at->toIso8601String(), 'eligible' => $active && $o->status === 'PENDING_PAYMENT'],
            'item_count' => DB::table('order_items')->where('order_id', $o->id)->sum('quantity'),
            'can_cancel' => $canCancel && $o->status === 'PENDING_PAYMENT' && $o->payment_state === 'NOT_STARTED'];
        if ($detail) {
            $a = DB::table('order_addresses')->where('order_id', $o->id)->firstOrFail();
            $data['shipment'] = app(FulfilmentService::class)->projection($o);
            $data['contact'] = ['email' => $o->contact_email, 'address' => json_decode($a->address, true)];
            $data['calculation'] = $o->calculation;
            $data['lines'] = DB::table('order_items')->where('order_id', $o->id)->orderBy('id')->get()->map(fn ($l) => ['id' => $l->id, 'quantity' => $l->quantity, 'unit_price_minor' => (string) $l->unit_price_minor, 'line_subtotal_minor' => (string) $l->line_subtotal_minor, 'tax_minor' => (string) $l->tax_minor, 'line_total_minor' => (string) $l->line_total_minor, 'snapshot' => array_intersect_key(json_decode($l->snapshot, true), array_flip(['name', 'sku', 'options', 'image'])), 'tax' => json_decode($l->tax_snapshot, true)])->all();
            $data['history'] = DB::table('order_status_history')->where('order_id', $o->id)->orderBy('created_at')->orderBy('id')->get()->map(fn ($h) => ['status' => $h->to_status, 'at' => CarbonImmutable::parse($h->created_at)->toIso8601String()])->all();
        }

        return $data;
    }

    /** Caller holds the order lock; payment domain supplies neutral outcomes. */
    public function paymentUpdate(Order $o, string $state, ?string $status = null, bool $hold = false): void
    {
        $from = $o->status;
        $next = $status ?? $from;
        if ($o->payment_state === $state && $next === $from && (! $hold || $o->financial_hold)) {
            return;
        }
        if ($o->version === 2147483647) {
            throw new \LogicException('Order version exhausted.');
        }
        $o->forceFill(['payment_state' => $state, 'status' => $next, 'version' => $o->version + 1, 'financial_hold' => $o->financial_hold || $hold, 'paid_at' => $o->paid_at ?? ($next === 'PAID' ? CheckoutConfiguration::now() : null)])->save();
        if ($from !== $next) {
            $this->history($o, $from, 'system', null, 'Verified payment outcome', $next === 'PAID' ? 'OrderPaid' : 'OrderPaymentReview');
        }
    }

    private function history(Order $o, ?string $from, string $source, ?string $actor, string $reason, string $event): void
    {
        $id = (string) Str::uuid7();
        DB::table('order_status_history')->insert(['id' => $id, 'order_id' => $o->id, 'from_status' => $from, 'to_status' => $o->status, 'actor_user_id' => $actor, 'source' => $source, 'reason' => $reason, 'event' => $event]);
        DB::table('audit_logs')->insert(['id' => (string) Str::uuid7(), 'actor_user_id' => $actor, 'actor_type' => $actor ? 'user' : 'guest', 'action' => 'order.'.match ($event) {
            'OrderCreated' => 'created', 'OrderCancelled' => 'cancelled', 'OrderPaid' => 'paid', default => 'payment_review'
        }, 'subject_type' => 'order', 'subject_id' => $o->id, 'outcome' => 'success', 'reason' => 'Order lifecycle transition', 'changes' => json_encode(['event_id' => $id, 'from' => $from, 'to' => $o->status], JSON_THROW_ON_ERROR), 'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid7(), 'occurred_at' => now(), 'created_at' => now()]);
    }
}
