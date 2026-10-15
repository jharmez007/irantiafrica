<?php

namespace App\Payments;

use App\Models\Cart;
use App\Models\Order;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Retire only order-snapshot lines after an applied payment, once per order. */
final class PaidCartReconciliation
{
    /** The caller holds the order lock and an open transaction. */
    public function reconcile(Order $order): void
    {
        if ($order->status !== 'PAID' || ! DB::table('payments')->where('order_id', $order->id)->whereNotNull('applied_at')->exists()) {
            return;
        }
        if (DB::table('cart_payment_reconciliations')->where('order_id', $order->id)->exists()) {
            return;
        }

        $cart = Cart::where('id', $order->source_cart_id)->lockForUpdate()->first();
        $removed = 0;
        $preserved = 0;
        if ($cart?->status === 'active') {
            $purchased = DB::table('order_items')->where('order_id', $order->id)->pluck('quantity', 'variant_id');
            $items = DB::table('cart_items')->where('cart_id', $cart->id)->lockForUpdate()->get();
            $unchanged = $cart->version === $order->source_cart_version;
            $exactSnapshot = $unchanged && $items->count() === $purchased->count()
                && $items->every(fn ($item): bool => (int) ($purchased[$item->variant_id] ?? 0) === (int) $item->quantity);
            $placedAt = CarbonImmutable::parse($order->created_at);
            foreach ($items as $item) {
                $quantity = $purchased[$item->variant_id] ?? null;
                if ($quantity === null) {
                    continue;
                }
                // When the bag changed, a line is safe to retire only if it still
                // has its original quantity and was last touched before placement.
                $safe = $exactSnapshot || (! $unchanged && (int) $item->quantity === (int) $quantity
                    && CarbonImmutable::parse($item->created_at)->lt($placedAt)
                    && CarbonImmutable::parse($item->updated_at)->lt($placedAt));
                if ($safe) {
                    DB::table('cart_items')->where('id', $item->id)->delete();
                    $removed++;
                } else {
                    $preserved++;
                }
            }
            if ($removed > 0) {
                if ($cart->version === 2147483647) {
                    throw new \LogicException('Cart version exhausted.');
                }
                $cart->version++;
                $cart->save();
            }
        }
        DB::table('cart_payment_reconciliations')->insert([
            'order_id' => $order->id,
            'source_cart_id' => $order->source_cart_id,
            'removed_lines' => $removed,
            'preserved_lines' => $preserved,
        ]);
    }
}
