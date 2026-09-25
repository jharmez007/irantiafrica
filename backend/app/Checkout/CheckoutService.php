<?php

namespace App\Checkout;

use App\Cart\CartMoney;
use App\Cart\CartService;
use App\Catalog\CatalogRead;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Models\Cart;
use App\Models\CheckoutSession;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class CheckoutService
{
    private const ACTIVE = ['DRAFT', 'QUOTED', 'RESERVED'];

    public function __construct(private CartService $carts, private InventoryService $stock, private CheckoutConfiguration $configuration) {}

    /**
     * @return array{checkout:CheckoutSession,token:?string} */
    public function begin(?User $user, ?string $cartToken, ?string $checkoutToken, int $version, string $key): array
    {
        return DB::transaction(function () use ($user, $cartToken, $checkoutToken, $version, $key): array {
            if ($user) {
                User::lockForUpdate()->findOrFail($user->id);
            }
            // Resolve a still-owned guest attempt explicitly even after signing in; never transfer it.
            if ($user && $checkoutToken && preg_match('/^[0-9a-f]{64}$/D', $checkoutToken)) {
                $guest = CheckoutSession::whereNull('promoted_at')->whereNull('user_id')->where('guest_token_hash', hash('sha256', $checkoutToken))->whereIn('status', self::ACTIVE)->first();
                if ($guest) {
                    $guest = $this->locked($guest->id, $user, $checkoutToken);
                    $this->synchronize($guest);
                    if (in_array($guest->status, self::ACTIVE, true)) {
                        throw new CheckoutConflict('CHECKOUT_ALREADY_ACTIVE', 'Resume or cancel your guest checkout before starting an account checkout.', ['checkout_id' => $guest->id]);
                    }
                }
            }
            $view = $this->carts->view($user, $cartToken);
            $cart = $user ? Cart::where('user_id', $user->id)->where('status', 'active')->lockForUpdate()->firstOrFail() : Cart::whereNull('user_id')->where('guest_token_hash', hash('sha256', $cartToken ?? ''))->where('status', 'active')->lockForUpdate()->first();
            if (! $cart) {
                throw new CheckoutConflict('CART_REVIEW_REQUIRED', 'Open your cart before beginning checkout.');
            }
            $hash = hash('sha256', json_encode(['cart_version' => $version], JSON_THROW_ON_ERROR));
            $token = $user ? null : hash_hmac('sha256', 'checkout:'.$cartToken.':'.$key, (string) config('app.key'));
            $existing = CheckoutSession::where('source_cart_id', $cart->id)->where('creation_key', $key)->first();
            if ($existing) {
                if ($user === null && $existing->expires_at->addMinutes(5)->lte(CheckoutConfiguration::now())) {
                    throw new CheckoutConflict('CHECKOUT_EXPIRED', 'Use a new checkout attempt after expiry.');
                }
                if (! hash_equals($existing->creation_hash, $hash)) {
                    throw new CheckoutConflict('IDEMPOTENCY_CONFLICT', 'This retry key was used with different input.');
                }
                $this->synchronize($existing);

                return ['checkout' => $existing, 'token' => $token];
            }
            $active = CheckoutSession::whereNull('promoted_at')->whereIn('status', self::ACTIVE)->where(function ($q) use ($cart, $user) {
                $q->where('source_cart_id', $cart->id);
                if ($user) {
                    $q->orWhere('user_id', $user->id);
                }
            })->lockForUpdate()->first();
            if ($active) {
                $this->synchronize($active);
                if (in_array($active->status, self::ACTIVE, true)) {
                    throw new CheckoutConflict('CHECKOUT_ALREADY_ACTIVE', 'Resume or cancel your existing checkout before starting another.', ['checkout_id' => $active->id]);
                }
            }
            if ($cart->version !== $version || $view->data['items'] === [] || $view->data['needs_review']) {
                throw new CheckoutConflict('CART_REVIEW_REQUIRED', 'Review every cart item before checkout.', ['cart' => $view->data]);
            }
            $s = new CheckoutSession;
            $s->forceFill(['user_id' => $user?->id, 'guest_token_hash' => $token ? hash('sha256', $token) : null, 'cart_id' => $cart->id, 'source_cart_id' => $cart->id, 'cart_version' => $version, 'creation_key' => $key, 'creation_hash' => $hash, 'status' => 'DRAFT', 'subtotal_minor' => $view->data['subtotal_minor'], 'expires_at' => CheckoutConfiguration::now()->addSeconds((int) config('inventory.reservation_ttl_seconds'))])->save();
            $variants = ProductVariant::whereIn('id', array_column($view->data['items'], 'variant_id'))->get()->keyBy('id');
            foreach ($view->data['items'] as $line) {
                $v = $variants->get($line['variant_id']) ?? throw new CheckoutConflict('CART_REVIEW_REQUIRED', 'A selected variant changed. Review your cart.');
                $p = DB::table('products')->where('id', $v->product_id)->firstOrFail();
                DB::table('checkout_lines')->insert(['id' => (string) Str::uuid(), 'checkout_id' => $s->id, 'variant_id' => $v->id, 'quantity' => $line['quantity'], 'unit_price_minor' => $line['unit_price_minor'], 'line_subtotal_minor' => $line['line_subtotal_minor'], 'snapshot' => json_encode(['name' => $line['name'], 'sku' => $v->sku, 'options' => $line['options'], 'image' => $line['image'], 'price_version' => $v->price_version, 'product_version' => $p->content_version, 'tax_category' => $p->tax_category_code], JSON_THROW_ON_ERROR)]);
            }
            $this->event('created', $s);

            return ['checkout' => $s->refresh(), 'token' => $token];
        }, 3);
    }

    public function owned(string $id, ?User $user, ?string $token): CheckoutSession
    {
        $s = CheckoutSession::where('id', $id)->firstOrFail();
        $owned = $s->user_id !== null ? $user?->id === $s->user_id : ($token !== null && $s->guest_token_hash !== null && hash_equals($s->guest_token_hash, hash('sha256', $token)));
        abort_unless($owned && ($s->user_id !== null || $s->expires_at->addMinutes(5)->isFuture()), 404);

        return $s;
    }

    private function locked(string $id, ?User $user, ?string $token): CheckoutSession
    {
        $s = $this->owned($id, $user, $token);
        if ($s->user_id) {
            $owner = User::lockForUpdate()->findOrFail($s->user_id);
            abort_unless($owner->status === 'active', 401);
        }
        if ($s->cart_id) {
            Cart::where('id', $s->cart_id)->lockForUpdate()->first();
        }

        return CheckoutSession::where('id', $id)->lockForUpdate()->firstOrFail();
    }

    /**
     * @param array<string,mixed> $data */
    public function command(string $id, ?User $user, ?string $token, string $action, array $data = [], ?string $key = null): CheckoutSession
    {
        $result = DB::transaction(function () use ($id, $user, $token, $action, $data, $key): CheckoutSession|CheckoutConflict {
            $s = $this->locked($id, $user, $token);
            $this->synchronize($s);
            if ($action === 'read') {
                return $s;
            }
            if ($s->promoted_at !== null) {
                return new CheckoutConflict('CHECKOUT_PROMOTED', 'This checkout belongs to an order. Use the order page.', ['order_id' => DB::table('orders')->where('checkout_id', $s->id)->value('id')]);
            }
            if ($action === 'cancel') {
                if ($s->status === 'CANCELLED' || $s->status === 'EXPIRED') {
                    return $s;
                }
                if ($s->current_reservation_id) {
                    $this->stock->release($s->current_reservation_id);
                }
                $s->status = 'CANCELLED';
                $this->save($s);
                $this->event('cancelled', $s);

                return $s;
            }
            if (! in_array($s->status, self::ACTIVE, true)) {
                return new CheckoutConflict('CHECKOUT_'.$s->status, 'This checkout requires a new attempt.', ['checkout' => $this->projection($s)]);
            }
            $hash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
            if ($action === 'reserve' && $s->reserve_key !== null) {
                if ($s->reserve_key === $key && $s->reserve_hash === $hash && $s->status === 'RESERVED') {
                    return $s;
                }

                return new CheckoutConflict('IDEMPOTENCY_CONFLICT', 'This checkout has already processed a different reservation request.');
            }
            if ($s->version !== ($data['expected_version'] ?? null)) {
                return new CheckoutConflict('CHECKOUT_VERSION_CONFLICT', 'Checkout changed. Refresh and review before retrying.');
            }
            if ($action === 'address') {
                if ($s->status === 'RESERVED') {
                    return new CheckoutConflict('CHECKOUT_STATE_CONFLICT', 'Cancel this reservation before changing delivery details.');
                }
                $address = $data['address'] ?? null;
                if (isset($data['saved_address_id'])) {
                    abort_unless($user !== null, 401);
                    $row = DB::table('addresses')->where('user_id', $user->id)->where('id', $data['saved_address_id'])->first();
                    abort_unless($row !== null, 404);
                    $address = (array) $row;
                    foreach (['id', 'user_id', 'created_at', 'updated_at'] as $field) {
                        unset($address[$field]);
                    }
                }
                $address = NigeriaAddress::validate($address ?? []);
                DB::table('checkout_addresses')->updateOrInsert(['checkout_id' => $s->id], ['id' => DB::table('checkout_addresses')->where('checkout_id', $s->id)->value('id') ?? (string) Str::uuid(), 'email' => strtolower(trim($data['email'])), 'address' => json_encode($address, JSON_THROW_ON_ERROR), 'updated_at' => CheckoutConfiguration::now()]);
                $s->forceFill(['status' => 'DRAFT', 'configuration_id' => null, 'calculation' => null, 'tax_minor' => null, 'delivery_minor' => null, 'total_minor' => null, 'fingerprint' => null]);
                DB::table('checkout_lines')->where('checkout_id', $s->id)->update(['tax_snapshot' => null]);
                $this->save($s);

                return $s;
            }
            if ($action === 'validate') {
                if ($s->status === 'RESERVED') {
                    return $s;
                }
                try {
                    $this->quote($s);
                } catch (CheckoutConflict $e) {
                    return $e;
                }

                return $s;
            }
            if ($action !== 'reserve' || $s->status !== 'QUOTED' || ! hash_equals($s->fingerprint ?? '', (string) ($data['fingerprint'] ?? ''))) {
                return new CheckoutConflict('CHECKOUT_REVIEW_REQUIRED', 'Review a valid quote before reserving.');
            }
            // Nested transaction rolls back a new hold if a concurrent catalog/config edit is detected.
            try {
                DB::transaction(function () use ($s, $key, $hash): void {
                    CheckoutConfiguration::lock();
                    $reference = (string) Str::uuid();
                    $items = DB::table('checkout_lines')->where('checkout_id', $s->id)->orderBy('variant_id')->get()->map(fn ($l) => ['variant_id' => $l->variant_id, 'quantity' => $l->quantity])->all();
                    $r = $this->stock->reserveMany($reference, $items);
                    if ($r->status !== 'ACTIVE') {
                        throw new CheckoutConflict('CHECKOUT_EXPIRED', 'The reservation is no longer active.');
                    }
                    // Inventory now owns sorted product/variant locks; no duplicated lock protocol.
                    if ($this->changed($s, true)) {
                        throw new CheckoutConflict('CHECKOUT_REVIEW_REQUIRED', 'Catalog or checkout configuration changed. Begin a new reviewed attempt.');
                    }
                    $s->forceFill(['inventory_reference_id' => $reference, 'current_reservation_id' => $r->id, 'reserve_key' => $key, 'reserve_hash' => $hash, 'status' => 'RESERVED', 'expires_at' => $r->expires_at]);
                    $this->save($s);
                });
            } catch (InventoryConflict|CheckoutConflict $e) {
                $s->refresh();
                $s->status = 'REVIEW_REQUIRED';
                $this->save($s);

                return $e instanceof InventoryConflict ? new CheckoutConflict($e->inventoryCode, 'Unable to reserve every item. Review current stock and begin a new checkout.') : $e;
            }
            $this->event('reserved', $s);

            return $s;
        }, 3);
        if ($result instanceof CheckoutConflict) {
            throw $result;
        }

        return $result;
    }

    /**
     * @template T
     *
     * @param  array<string,mixed>  $data
     * @param  \Closure(CheckoutSession):T  $place
     * @return T
     */
    public function promote(string $id, ?User $user, ?string $token, array $data, \Closure $place): mixed
    {
        $result = DB::transaction(function () use ($id, $user, $token, $data, $place) {
            $s = $this->locked($id, $user, $token);
            // Concurrent creation can replay after the winning transaction transfers ownership.
            if ($s->promoted_at !== null) {
                return $place($s);
            }
            CheckoutConfiguration::lock();
            if ($s->current_reservation_id) {
                $this->stock->inspectForPromotion($s->current_reservation_id);
            }
            $this->synchronize($s);
            if ($s->status !== 'RESERVED' || $s->version !== $data['expected_version'] || ! hash_equals($s->fingerprint ?? '', $data['fingerprint'])) {
                return new CheckoutConflict('ORDER_CHECKOUT_INELIGIBLE', 'Refresh checkout. Order creation requires the current reviewed, reserved checkout.');
            }
            try {
                return DB::transaction(function () use ($s, $place) {
                    $order = $place($s);
                    if ($s->expires_at->lte(CheckoutConfiguration::now())) {
                        throw new CheckoutConflict('ORDER_CHECKOUT_EXPIRED', 'The reservation expired before order creation completed.');
                    }
                    $s->promoted_at = CheckoutConfiguration::now();
                    $this->save($s);

                    return $order;
                });
            } catch (CheckoutConflict $e) {
                $s->refresh();
                $this->synchronize($s);

                return $e;
            }
        }, 3);
        if ($result instanceof CheckoutConflict) {
            throw $result;
        }

        return $result;
    }

    /** Caller holds cart/session locks; reconciles terminal effects without throwing them away. */
    private function synchronize(CheckoutSession $s): void
    {
        if ($s->promoted_at !== null || ! in_array($s->status, self::ACTIVE, true)) {
            return;
        }
        CheckoutConfiguration::lock();
        if ($s->current_reservation_id) {
            $outcome = $this->stock->expire($s->current_reservation_id);
            if ($outcome->reservation->status !== 'ACTIVE') {
                $s->status = 'EXPIRED';
                $this->save($s);
                $this->event('expired', $s);

                return;
            }
        }
        if ($s->expires_at->lte(CheckoutConfiguration::now())) {
            if ($s->current_reservation_id) {
                $this->stock->release($s->current_reservation_id);
            }
            $s->status = 'EXPIRED';
            $this->save($s);
            $this->event('expired', $s);

            return;
        }
        CheckoutConfiguration::lock();
        if ($this->changed($s, $s->status === 'RESERVED')) {
            if ($s->current_reservation_id) {
                $this->stock->release($s->current_reservation_id);
            }
            $s->status = 'REVIEW_REQUIRED';
            $this->save($s);
            $this->event('review_required', $s);
        }
    }

    private function changed(CheckoutSession $s, bool $held): bool
    {
        $cart = $s->cart_id ? Cart::find($s->cart_id) : null;
        if (! $cart || $cart->status !== 'active' || $cart->version !== $s->cart_version) {
            return true;
        }
        $lines = DB::table('checkout_lines')->where('checkout_id', $s->id)->get();
        $variants = ProductVariant::whereIn('id', $lines->pluck('variant_id'))->get()->keyBy('id');
        $products = DB::table('products')->whereIn('id', $variants->pluck('product_id'))->get()->keyBy('id');
        $eligible = CatalogRead::query(false, false)->whereIn('id', $variants->pluck('product_id'))->pluck('id')->all();
        if (count($eligible) !== $products->count()) {
            return true;
        }
        $cartItems = DB::table('cart_items')->where('cart_id', $cart->id)->pluck('quantity', 'variant_id')->all();
        if (count($cartItems) !== $lines->count()) {
            return true;
        }
        foreach ($lines as $line) {
            $v = $variants->get($line->variant_id);
            $p = $v ? $products->get($v->product_id) : null;
            $snap = json_decode($line->snapshot, true);
            if (! $v || ! $p || $v->status !== 'active' || $p->status !== 'published' || $v->price_version !== $snap['price_version'] || $p->content_version !== $snap['product_version'] || $v->unit_price_minor !== (string) $line->unit_price_minor || ($cartItems[$line->variant_id] ?? null) !== $line->quantity) {
                return true;
            }
        }
        if (! $held && $this->carts->revalidate($cart)['needs_review']) {
            return true;
        }
        if ($s->configuration_id) {
            try {
                if ($this->configuration->current()['id'] !== $s->configuration_id) {
                    return true;
                }
            } catch (CheckoutConflict) {
                return true;
            }
        }

        return false;
    }

    private function quote(CheckoutSession $s): void
    {
        CheckoutConfiguration::lock();
        $config = $this->configuration->current();
        $row = DB::table('checkout_addresses')->where('checkout_id', $s->id)->first();
        if (! $row) {
            throw new CheckoutConflict('ADDRESS_REQUIRED', 'Enter your contact and delivery address.');
        }
        $delivery = $this->configuration->delivery($config, json_decode($row->address, true));
        $rules = array_column($config['payload']['product_rules'], null, 'category');
        $productTax = 0;
        $taxes = [];
        foreach (DB::table('checkout_lines')->where('checkout_id', $s->id)->get() as $line) {
            $snapshot = json_decode($line->snapshot, true);
            $rule = $rules[$snapshot['tax_category']] ?? null;
            if (! $rule) {
                throw new CheckoutConflict('TAX_CONFIGURATION_REQUIRED', 'A required product tax category is not configured.');
            }
            $tax = TaxMath::tax((int) $line->line_subtotal_minor, $rule['rate']);
            $productTax = CartMoney::add($productTax, $tax);
            $taxes[$line->id] = ['configuration_id' => $config['id'], 'version' => $config['version_code'], 'category' => $rule['category'], 'label' => $rule['label'], 'rate' => $rule['rate'], 'taxable_base_minor' => (string) $line->line_subtotal_minor, 'tax_minor' => (string) $tax, 'rounding' => 'HALF_UP', 'allocation' => TaxMath::allocation($tax, $line->quantity)];
        }
        $dt = $config['payload']['delivery_tax'];
        $fee = CartMoney::line($delivery['amount_minor'], 1);
        $deliveryTax = $dt['taxable'] ? TaxMath::tax($fee, $dt['rate']) : 0;
        $tax = CartMoney::add($productTax, $deliveryTax);
        $total = CartMoney::add(CartMoney::add((int) $s->subtotal_minor, $tax), $fee);
        if ($total === 0) {
            throw new CheckoutConflict('ZERO_TOTAL_UNSUPPORTED', 'A zero-total checkout requires separate business review.');
        }
        $calculation = ['configuration_id' => $config['id'], 'version' => $config['version_code'], 'development_only' => $config['development_only'], 'currency' => 'NGN', 'rounding' => 'HALF_UP', 'product_taxable_base_minor' => $s->subtotal_minor, 'product_tax_minor' => (string) $productTax, 'delivery' => $delivery, 'delivery_taxable' => $dt['taxable'], 'delivery_tax_rate' => $dt['rate'], 'delivery_tax_label' => $dt['label'], 'delivery_taxable_base_minor' => $dt['taxable'] ? (string) $fee : '0', 'delivery_tax_minor' => (string) $deliveryTax];
        foreach ($taxes as $id => $snapshot) {
            DB::table('checkout_lines')->where('id', $id)->update(['tax_snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR)]);
        }
        $fingerprint = hash('sha256', json_encode([$s->id, $s->cart_version, $row->address, $row->email, $calculation, $taxes], JSON_THROW_ON_ERROR));
        $s->forceFill(['status' => 'QUOTED', 'configuration_id' => $config['id'], 'calculation' => $calculation, 'tax_minor' => (string) $tax, 'delivery_minor' => (string) $fee, 'total_minor' => (string) $total, 'fingerprint' => $fingerprint]);
        $this->save($s);
    }

    /**
     * @return array<string,mixed> */
    public function projection(CheckoutSession $s): array
    {
        $address = DB::table('checkout_addresses')->where('checkout_id', $s->id)->first();

        return ['id' => $s->id, 'order_id' => $s->promoted_at ? DB::table('orders')->where('checkout_id', $s->id)->value('id') : null, 'ownership' => $s->user_id ? 'account' : 'guest', 'status' => $s->status, 'version' => $s->version, 'currency' => 'NGN', 'expires_at' => $s->expires_at->toIso8601String(), 'fingerprint' => $s->fingerprint, 'subtotal_minor' => $s->subtotal_minor, 'tax_minor' => $s->tax_minor, 'delivery_minor' => $s->delivery_minor, 'total_minor' => $s->total_minor, 'calculation' => $s->calculation, 'contact' => $address ? ['email' => $address->email, 'address' => json_decode($address->address, true)] : null, 'lines' => DB::table('checkout_lines')->where('checkout_id', $s->id)->orderBy('id')->get()->map(fn ($l) => ['id' => $l->id, 'quantity' => $l->quantity, 'unit_price_minor' => (string) $l->unit_price_minor, 'line_subtotal_minor' => (string) $l->line_subtotal_minor, 'snapshot' => array_intersect_key(json_decode($l->snapshot, true), array_flip(['name', 'sku', 'options', 'image'])), 'tax' => $l->tax_snapshot ? json_decode($l->tax_snapshot, true) : null])->all()];
    }

    public function expireDue(int $limit): int
    {
        $ids = CheckoutSession::whereNull('promoted_at')->whereIn('status', self::ACTIVE)->where('expires_at', '<=', CheckoutConfiguration::now())->orderBy('expires_at')->limit($limit)->pluck('id');
        foreach ($ids as $id) {
            DB::transaction(function () use ($id): void {
                $s = CheckoutSession::where('id', $id)->firstOrFail();
                if ($s->user_id) {
                    User::where('id', $s->user_id)->lockForUpdate()->first();
                }
                if ($s->cart_id) {
                    Cart::where('id', $s->cart_id)->lockForUpdate()->first();
                }
                $s = CheckoutSession::where('id', $id)->lockForUpdate()->firstOrFail();
                $this->synchronize($s);
            }, 3);
        }

        return $ids->count();
    }

    private function save(CheckoutSession $s): void
    {
        if ($s->version === 2147483647) {
            throw new CheckoutConflict('CHECKOUT_VERSION_LIMIT', 'Checkout requires maintenance.');
        }$s->version++;
        $s->save();
    }

    private function event(string $event, CheckoutSession $s): void
    {
        Log::info('checkout.'.$event, ['checkout_id' => $s->id, 'status' => $s->status]);
    }
}
