<?php

namespace App\Communications;

use Illuminate\Support\Facades\DB;

final class NotificationContent
{
    /** @var array<string,array{string,string}> */
    public const MATRIX = [
        'OrderCreated' => ['Order received — payment not yet confirmed', 'We received your order. This message does not confirm payment. Check the current order status before taking any payment action.'],
        'PaymentSucceeded' => ['Payment confirmed', 'Your payment has been verified. Your order is awaiting the next fulfilment step; this message does not confirm dispatch.'],
        'PaymentRequiresReview' => ['We are checking your payment', 'Your payment needs further verification. Please do not pay again while it is being checked. Your order page remains the source of truth.'],
        'OrderShipped' => ['Your order has shipped', 'Staff have recorded dispatch of your order. Tracking information is included below when available.'],
        'OrderDelivered' => ['Delivery confirmed', 'Staff have recorded delivery of your order. Check your order page for the current status and any available return options.'],
        'ReturnRequested' => ['Return request received', 'We received your return request. It has not yet been approved.'],
        'ReturnApproved' => ['Return request approved', 'The quantities shown as approved have been accepted for the next return-processing step. This is not a refund confirmation. The store will confirm any required return arrangements separately.'],
        'ReturnRejected' => ['Return request decision', 'Your return request was not approved. Check the order page for the decision and contact the store through its published support channel if you need assistance.'],
        'ReturnReceived' => ['Returned goods received', 'Staff have confirmed physical receipt of the approved goods. Receipt alone does not confirm a refund or a saleable inspection result.'],
        'RefundInitiated' => ['Your refund is being processed', 'Staff have initiated refund processing. This does not mean the funds have reached your account. Please check the current order status.'],
        'RefundSucceeded' => ['Refund completed', 'The payment provider has confirmed the refund as processed. Your bank or payment method may take additional time to display the credit.'],
        'RefundFailed' => ['An update on your refund', 'The refund could not be completed and requires staff follow-up. No successful refund is being claimed. Please do not make another payment because of this message.'],
    ];

    public static function origin(): string
    {
        $origin = rtrim((string) config('communications.frontend_origin'), '/');
        $p = parse_url($origin);
        $secure = app()->environment(['production', 'staging']);
        if (! $p || ! isset($p['host']) || ! in_array($p['scheme'] ?? '', $secure ? ['https'] : ['https', 'http'], true) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment']) || isset($p['path'])) {
            throw new \LogicException('NOTIFICATION_ORIGIN_INVALID');
        }
        if (! $secure && $p['scheme'] === 'http' && ! in_array($p['host'], ['localhost', '127.0.0.1'], true)) {
            throw new \LogicException('NOTIFICATION_ORIGIN_INVALID');
        }

        return $origin;
    }

    /** @return array<string,mixed> */
    public function snapshot(string $event, string $orderId, ?string $returnId, string $occurred): array
    {
        $o = DB::table('orders')->where('id', $orderId)->firstOrFail();
        $data = ['event' => $event, 'order_number' => $o->public_reference, 'order_date' => $o->created_at, 'occurred_at' => $occurred, 'account_order_id' => $o->user_id ? $o->id : null, 'guest' => ! $o->user_id, 'subtotal_minor' => (string) $o->subtotal_minor, 'product_tax_minor' => (string) $o->product_tax_minor, 'delivery_minor' => (string) $o->delivery_minor, 'delivery_tax_minor' => (string) $o->delivery_tax_minor, 'total_minor' => (string) $o->total_minor, 'items' => DB::table('order_items')->where('order_id', $o->id)->orderBy('id')->get()->map(fn ($i) => ['name' => json_decode($i->snapshot, true)['name'], 'quantity' => $i->quantity, 'unit_price_minor' => (string) $i->unit_price_minor])->all()];
        if ($event === 'OrderShipped') {
            $s = DB::table('shipments')->where('order_id', $o->id)->firstOrFail();
            $data['shipment'] = ['carrier' => $s->provider_label, 'tracking_number' => $s->tracking_number, 'tracking_url' => self::tracking($s->tracking_url), 'shipped_at' => $s->shipped_at];
        }
        if ($returnId) {
            $r = DB::table('return_requests')->where('id', $returnId)->firstOrFail();
            $data['return_reference'] = $r->id;
            $data['return_items'] = DB::table('return_items')->join('order_items', 'order_items.id', '=', 'return_items.order_item_id')->where('return_request_id', $returnId)->select('return_items.*', 'order_items.snapshot')->orderBy('return_items.id')->get()->map(fn ($i) => ['name' => json_decode($i->snapshot, true)['name'], 'quantity' => $i->quantity, 'approved_quantity' => $i->approved_quantity])->all();
            if (str_starts_with($event, 'Refund')) {
                $f = DB::table('refunds')->where('return_request_id', $returnId)->firstOrFail();
                if ($event === 'RefundSucceeded' && $f->status !== 'SUCCEEDED') {
                    throw new \LogicException('UNVERIFIED_REFUND_EVENT');
                }
                $data['refund_minor'] = (string) $f->amount_minor;
            }
        }
        if ($event === 'PaymentSucceeded' && ! DB::table('payments')->where('order_id', $orderId)->whereNotNull('applied_at')->exists()) {
            throw new \LogicException('UNVERIFIED_PAYMENT_EVENT');
        }

        return $data;
    }

    public static function tracking(?string $url): ?string
    {
        if (! $url) {
            return null;
        }
        $p = parse_url($url);

        return $p && ($p['scheme'] ?? '') === 'https' && isset($p['host']) && in_array(strtolower($p['host']), config('shipping.tracking_hosts', []), true) && ! isset($p['user']) && ! isset($p['pass']) && ! isset($p['port']) && ! preg_match('/[\x00-\x20\x7f]/', $url) ? $url : null;
    }

    public static function money(string $minor): string
    {
        if (! preg_match('/^\d{1,18}$/D', $minor)) {
            throw new \LogicException('INVALID_HISTORICAL_AMOUNT');
        }

        return 'NGN '.number_format(intdiv((int) $minor, 100), 0, '.', ',').'.'.str_pad((string) ((int) $minor % 100), 2, '0', STR_PAD_LEFT);
    }
}
