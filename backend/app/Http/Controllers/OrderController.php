<?php

namespace App\Http\Controllers;

use App\Checkout\CheckoutConfiguration;
use App\Fulfilment\FulfilmentService;
use App\Models\Order;
use App\Models\User;
use App\Orders\OrderService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class OrderController
{
    public function __construct(private OrderService $orders) {}

    private function user(Request $r): ?User
    {
        $u = $r->user();

        return $u instanceof User ? $u : null;
    }

    /** @param list<string> $keys */
    private function only(Request $r, array $keys): void
    {
        if (array_diff(array_keys($r->all()), $keys)) {
            throw ValidationException::withMessages(['request' => 'Unknown input field.']);
        }
    }

    /** @return array<string,mixed> */
    private function version(Request $r): array
    {
        return $r->validate(['expected_version' => ['required', function ($a, $v, $fail) {
            if (! is_int($v) || $v < 1 || $v > 2147483647) {
                $fail('Use a positive JSON integer version.');
            }
        }]]);
    }

    public function create(Request $r): JsonResponse
    {
        $this->only($r, ['checkout_id', 'expected_version', 'fingerprint']);
        $data = $this->version($r) + $r->validate(['checkout_id' => ['required', 'uuid'], 'fingerprint' => ['required', 'string', 'regex:/^[0-9a-f]{64}$/D']]);
        $key = $r->header('Idempotency-Key');
        if (! is_string($key) || ! Str::isUuid($key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'Supply a UUID Idempotency-Key.']);
        }
        $token = $r->cookie('iranti_checkout');
        $order = $this->orders->createFromCheckout($this->user($r), is_string($token) ? $token : null, $data, strtolower($key));

        if ($grant = $this->orders->placementGrant($order)) {
            $minutes = max(1, (int) ceil(CheckoutConfiguration::now()->diffInSeconds($order->guest_expires_at, false) / 60));
            Cookie::queue(Cookie::make('iranti_order_'.str_replace('-', '', $order->id), $grant, $minutes, '/api/v1/orders/'.$order->id, null, (bool) config('session.secure'), true, false, 'lax'));
        }

        return response()->json(['data' => $this->orders->projection($order, true, true)], 201);
    }

    public function index(Request $r): JsonResponse
    {
        $u = $this->user($r) ?? abort(401);

        return $this->listing($r, $u, false);
    }

    public function adminIndex(Request $r): JsonResponse
    {
        return $this->listing($r, $this->user($r) ?? abort(401), true);
    }

    private function listing(Request $r, User $user, bool $admin): JsonResponse
    {
        $this->only($r, ['cursor', 'status', 'from', 'to']);
        $v = $r->validate(['cursor' => ['sometimes', 'string', 'max:2048'], 'status' => ['sometimes', 'in:PENDING_PAYMENT,CANCELLED,PAID,PAYMENT_REVIEW,PROCESSING,SHIPPED,DELIVERED'], 'from' => ['sometimes', 'date_format:Y-m-d'], 'to' => array_merge(['sometimes', 'date_format:Y-m-d'], $r->filled('from') ? ['after_or_equal:from'] : [])]);
        $q = Order::query();
        if (! $admin) {
            $q->where('user_id', $user->id);
        }
        if (isset($v['status'])) {
            $q->where('status', $v['status']);
        }
        if (isset($v['from'])) {
            $q->where('created_at', '>=', $v['from'].' 00:00:00+00');
        }
        if (isset($v['to'])) {
            $q->where('created_at', '<', CarbonImmutable::parse($v['to'], 'UTC')->addDay());
        }
        $page = $q->orderByDesc('created_at')->orderByDesc('id')->cursorPaginate(20);

        return response()->json(['data' => ['items' => $page->getCollection()->map(fn (Order $o) => $this->orderProjection($o, false, false, $admin, $user))->all(), 'next_cursor' => $page->nextCursor()?->encode()]]);
    }

    public function show(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);
        $token = $r->cookie('iranti_order_'.str_replace('-', '', $id));
        $o = $this->orders->owned($id, $this->user($r), is_string($token) ? $token : null);

        return response()->json(['data' => $this->orders->projection($this->orders->read($o), true, true)]);
    }

    public function adminShow(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);

        return response()->json(['data' => $this->orderProjection($this->orders->read(Order::findOrFail($id)), true, $this->user($r)?->hasPermission('orders.cancel') ?? false, true, $this->user($r))]);
    }

    /** @return array<string,mixed> */
    private function orderProjection(Order $o, bool $detail, bool $cancel, bool $admin, ?User $user): array
    {
        $data = $this->orders->projection($o, $detail, $cancel);
        if ($admin && ! $user?->hasPermission('payments.reconcile')) {
            $data['payment'] = ['state' => $o->paid_at ? 'SUCCESSFUL' : 'PENDING', 'available' => false];
        }

        if ($admin && $detail && $user) {
            $data['fulfilment'] = app(FulfilmentService::class)->adminProjection($o, $user);
        }

        return $data;
    }

    public function cancel(Request $r, string $id): JsonResponse
    {
        return $this->cancellation($r, $id, false);
    }

    public function adminCancel(Request $r, string $id): JsonResponse
    {
        return $this->cancellation($r, $id, true);
    }

    private function cancellation(Request $r, string $id, bool $admin): JsonResponse
    {
        $this->only($r, ['expected_version', 'reason']);
        $data = $this->version($r) + $r->validate(['reason' => ['required', 'string', 'min:1', 'max:500', 'regex:/^[^\\x00-\\x1F\\x7F]+$/u']]);
        $token = $r->cookie('iranti_order_'.str_replace('-', '', $id));
        $o = $this->orders->cancelUnpaid($id, $this->user($r), is_string($token) ? $token : null, $data['expected_version'], trim($data['reason']), $admin);

        return response()->json(['data' => $this->orders->projection($o, true, true)]);
    }
}
