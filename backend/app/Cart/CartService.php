<?php

namespace App\Cart;

use App\Inventory\StockMath;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** All cart row writes and ownership checks live here; cart never mutates inventory. */
final class CartService
{
    public function __construct(private CartCatalog $catalog) {}

    public function view(?User $user, ?string $token): CartResult
    {
        return $this->operate($user, $token);
    }

    public function addItem(?User $user, ?string $token, string $variantId, mixed $quantity, int $version): CartResult
    {
        return $this->operate($user, $token, 'add', $version, $variantId, $quantity);
    }

    public function updateItem(?User $user, ?string $token, string $itemId, mixed $quantity, int $version): CartResult
    {
        return $this->operate($user, $token, 'update', $version, $itemId, $quantity);
    }

    public function removeItem(?User $user, ?string $token, string $itemId, int $version): CartResult
    {
        return $this->operate($user, $token, 'remove', $version, $itemId);
    }

    public function clear(?User $user, ?string $token, int $version): CartResult
    {
        return $this->operate($user, $token, 'clear', $version);
    }

    private function operate(?User $user, ?string $token, string $action = 'read', ?int $version = null, ?string $id = null, mixed $quantity = null): CartResult
    {
        if (in_array($action, ['add', 'update'], true)) {
            $quantity = StockMath::integer($quantity, 1, (int) config('cart.max_quantity'));
        }

        return DB::transaction(function () use ($user, $token, $action, $version, $id, $quantity): CartResult {
            if ($user !== null) {
                $owner = User::lockForUpdate()->findOrFail($user->id);
                abort_unless($owner->status === 'active', 401);
                $cart = $this->customerCart($owner);
                $merge = $this->mergeLocked($cart, $token);
                $newToken = null;
            } else {
                [$cart, $newToken] = $this->guestCart($token, $action === 'read');
                $merge = null;
            }
            if ($action !== 'read') {
                if ($cart->version !== $version) {
                    throw new CartConflict('CART_VERSION_CONFLICT', 'Your cart changed. Review the refreshed cart before trying again.');
                }
                $this->mutate($cart, $action, $id, $quantity);
                $this->bump($cart);
            }
            if ($cart->user_id === null) {
                $cart->expires_at = now()->toImmutable()->addDays((int) config('cart.guest_retention_days'));
                $cart->save();
            }

            $data = $this->revalidate($cart);
            if (in_array($action, ['add', 'update'], true) && $data['amount_limit']) {
                throw new CartConflict('CART_TOTAL_LIMIT', 'This cart exceeds the supported amount. Reduce its quantity.');
            }
            $data['merge'] = $merge;

            return new CartResult($data, $newToken, $user !== null && $token !== null && ($merge === null || $merge['status'] !== 'REVIEW_REQUIRED'));
        }, 3);
    }

    public function mergeGuestCart(User $user, ?string $token): CartResult
    {
        return $this->view($user, $token);
    }

    /** User and account cart locks are held. Guest operations never acquire account/user locks,
     * so account -> guest order cannot form an inverted dependency with guest mutations.
     *
     * @return array{status:string,message:string}|null
     */
    private function mergeLocked(Cart $account, ?string $token): ?array
    {
        if ($token === null || ! preg_match('/^[0-9a-f]{64}$/D', $token)) {
            return null;
        }
        $guest = Cart::whereNull('user_id')->where('guest_token_hash', hash('sha256', $token))->lockForUpdate()->first();
        if ($guest === null || $guest->status !== 'active') {
            return null;
        }
        if (! $guest->expires_at->isFuture()) {
            return ['status' => 'EXPIRED', 'message' => 'The previous guest cart has expired. Your account cart is preserved.'];
        }
        $sources = CartItem::where('cart_id', $guest->id)->get();
        $targets = CartItem::where('cart_id', $account->id)->get()->keyBy('variant_id');
        $combined = $targets->map(fn (CartItem $i): int => $i->quantity)->all();
        foreach ($sources as $source) {
            $combined[$source->variant_id] = ($combined[$source->variant_id] ?? 0) + $source->quantity;
        }
        $guest->expires_at = now()->toImmutable()->addDays((int) config('cart.guest_retention_days'));
        $guest->save();
        if (count($combined) > (int) config('cart.max_lines') || ($combined !== [] && max($combined) > (int) config('cart.max_quantity'))) {
            return ['status' => 'REVIEW_REQUIRED', 'message' => 'Your guest cart is preserved because combining it would exceed the cart limits. Reduce items in this account cart and refresh to retry, or sign out to edit the guest cart. Nothing has been discarded.'];
        }
        foreach ($sources as $source) {
            $item = $targets->get($source->variant_id) ?? new CartItem;
            $item->forceFill(['cart_id' => $account->id, 'variant_id' => $source->variant_id, 'quantity' => $combined[$source->variant_id]])->save();
        }
        $guest->forceFill(['status' => 'merged'])->save();
        if ($sources->isNotEmpty()) {
            $this->bump($account);
        }

        // Retain source rows until guest retention cleanup; old capability is now unusable.
        return $sources->isEmpty() ? null : ['status' => 'MERGED', 'message' => 'Your guest items have been merged. Review current prices and availability; quantities requiring a reduction remain unchanged until you accept it.'];
    }

    private function customerCart(User $owner): Cart
    {
        $cart = Cart::where('user_id', $owner->id)->where('status', 'active')->lockForUpdate()->first();
        if ($cart === null) {
            $cart = new Cart;
            // Authenticated retention is explicit-user action, not guest inactivity cleanup.
            $cart->forceFill(['user_id' => $owner->id, 'status' => 'active', 'version' => 1, 'expires_at' => '9999-12-31 00:00:00+00'])->save();
        }

        return $cart;
    }

    /** @return array{Cart,?string} */
    private function guestCart(?string $token, bool $allowCreate): array
    {
        $cart = $token !== null && preg_match('/^[0-9a-f]{64}$/D', $token)
            ? Cart::where('guest_token_hash', hash('sha256', $token))->whereNull('user_id')->lockForUpdate()->first() : null;
        if ($cart !== null && $cart->status === 'active' && $cart->expires_at->isFuture()) {
            return [$cart, $token];
        }
        if (! $allowCreate) {
            throw new CartConflict('CART_EXPIRED', 'This guest cart is no longer active. Refresh your cart.');
        }
        if ($cart !== null && $cart->status === 'active') {
            $cart->forceFill(['status' => 'expired'])->save();
        }
        $newToken = bin2hex(random_bytes(32));
        $cart = new Cart;
        $cart->forceFill(['guest_token_hash' => hash('sha256', $newToken), 'status' => 'active', 'version' => 1,
            'expires_at' => now()->addDays((int) config('cart.guest_retention_days'))])->save();

        return [$cart, $newToken];
    }

    private function mutate(Cart $cart, string $action, ?string $id, mixed $quantity): void
    {
        if ($action === 'clear') {
            CartItem::where('cart_id', $cart->id)->delete();

            return;
        }
        if ($id === null) {
            throw new \LogicException('An item or variant identifier is required.');
        }
        $item = $action === 'add' ? CartItem::where('cart_id', $cart->id)->where('variant_id', $id)->first()
            : CartItem::where('cart_id', $cart->id)->findOrFail($id);
        if ($action !== 'add' && $item === null) {
            abort(404);
        }
        if ($action === 'remove') {
            $item?->delete();

            return;
        }
        $variantId = $action === 'add' ? $id : ($item->variant_id ?? throw new \LogicException('Missing cart item'));
        $desired = $action === 'add' ? $quantity + ($item->quantity ?? 0) : $quantity;
        if ($desired > (int) config('cart.max_quantity')) {
            throw new CartConflict('CART_QUANTITY_LIMIT', 'The requested quantity exceeds the per-item cart limit.');
        }
        if ($item === null && CartItem::where('cart_id', $cart->id)->count() >= (int) config('cart.max_lines')) {
            throw new CartConflict('CART_LINE_LIMIT', 'The cart has reached its item limit.');
        }
        $data = $this->catalog->read([$variantId])[$variantId] ?? null;
        if ($data === null || ! $data['sellable']) {
            throw new CartConflict('ITEM_UNAVAILABLE', 'This item is no longer available.');
        }
        if ($desired > $data['available']) {
            throw new CartConflict('CART_STOCK_CHANGED', 'The requested quantity is no longer available. Review your cart.');
        }
        CartMoney::line($data['unit_price_minor'], $desired);
        $item ??= new CartItem;
        $item->forceFill(['cart_id' => $cart->id, 'variant_id' => $variantId, 'quantity' => $desired])->save();
    }

    private function bump(Cart $cart): void
    {
        if ($cart->version === 2147483647) {
            throw new CartConflict('CART_VERSION_LIMIT', 'This cart requires maintenance.');
        }
        $cart->version++;
        $cart->save();
    }

    /** Revalidation is read-only: it never silently deletes or reduces requested quantities.
     * @return array<string,mixed>
     */
    public function revalidate(Cart $cart): array
    {
        $items = CartItem::where('cart_id', $cart->id)->orderBy('created_at')->orderBy('id')->get();
        $catalog = $this->catalog->read(array_values($items->map(fn (CartItem $item): string => $item->variant_id)->all()));
        $lines = [];
        $subtotal = 0;
        $count = 0;
        $review = false;
        $amountLimit = false;
        foreach ($items as $item) {
            $data = $catalog[$item->variant_id] ?? null;
            $suggested = $data !== null && $data['sellable'] ? min((int) config('cart.max_quantity'), $data['available'], $item->quantity) : 0;
            $state = $data === null || ! $data['sellable'] ? 'UNAVAILABLE'
                : ($data['available'] === 0 ? 'OUT_OF_STOCK' : ($suggested < $item->quantity ? 'QUANTITY_REVIEW' : 'AVAILABLE'));
            $lineTotal = null;
            try {
                $lineTotal = $data !== null && $data['unit_price_minor'] !== null ? CartMoney::line($data['unit_price_minor'], $item->quantity) : null;
                if ($state === 'AVAILABLE' && $lineTotal !== null) {
                    $subtotal = CartMoney::add($subtotal, $lineTotal);
                }
            } catch (CartConflict) {
                $amountLimit = true;
                $state = 'AMOUNT_REVIEW';
            }
            $count += $item->quantity;
            $review = $review || $state !== 'AVAILABLE';
            $lines[] = ['id' => $item->id, 'variant_id' => $item->variant_id, 'quantity' => $item->quantity,
                'name' => $data['name'] ?? 'Unavailable item', 'slug' => $data['slug'] ?? null,
                'options' => $data['options'] ?? [], 'image' => $data['image'] ?? null,
                'unit_price_minor' => $data['unit_price_minor'] ?? null,
                'line_subtotal_minor' => $lineTotal === null ? null : (string) $lineTotal,
                'suggested_quantity' => $suggested, 'state' => $state];
        }

        return ['version' => $cart->version, 'currency' => 'NGN', 'items' => $lines, 'item_count' => $count,
            'subtotal_minor' => $amountLimit ? null : (string) $subtotal, 'needs_review' => $review, 'amount_limit' => $amountLimit,
            'limits' => ['quantity' => (int) config('cart.max_quantity'), 'lines' => (int) config('cart.max_lines')]];
    }

    /** Only guest/retired guest carts; authenticated selections are never aged out here. */
    public function purgeExpiredGuests(int $limit): int
    {
        return DB::transaction(function () use ($limit): int {
            $ids = Cart::whereNull('user_id')->where('expires_at', '<=', now())->orderBy('expires_at')->orderBy('id')
                ->limit($limit)->lock('for update skip locked')->pluck('id');

            return Cart::whereIn('id', $ids)->delete();
        });
    }
}
