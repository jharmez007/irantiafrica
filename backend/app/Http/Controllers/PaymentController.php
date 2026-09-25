<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\User;
use App\Orders\OrderService;
use App\Payments\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\CursorPaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class PaymentController
{
    public function __construct(private PaymentService $payments, private OrderService $orders) {}

    private function user(Request $r): ?User
    {
        $u = $r->user();

        return $u instanceof User ? $u : null;
    }

    private function token(Request $r, string $id): ?string
    {
        $t = $r->cookie('iranti_order_'.str_replace('-', '', $id));

        return is_string($t) ? $t : null;
    }

    /** @param list<string> $keys */
    private function only(Request $r, array $keys): void
    {
        if (array_diff(array_keys($r->all()), $keys)) {
            throw ValidationException::withMessages(['request' => 'Unknown input field.']);
        }
    }

    public function initialize(Request $r, string $id): JsonResponse
    {
        $this->only($r, ['method']);
        $v = $r->validate(['method' => ['required', 'in:card,bank_transfer']]);
        $key = $r->header('Idempotency-Key');
        if (! is_string($key) || ! Str::isUuid($key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'Supply a UUID Idempotency-Key.']);
        }
        $a = $this->payments->initialize($id, $this->user($r), $this->token($r, $id), strtolower($key), $v['method']);

        return response()->json(['data' => $this->payments->projection($a, true)], 201, ['Cache-Control' => 'no-store']);
    }

    public function status(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);
        $o = $this->orders->owned($id, $this->user($r), $this->token($r, $id));

        return $this->summary($o);
    }

    public function verify(Request $r, string $id, string $attempt): JsonResponse
    {
        $this->only($r, []);
        $o = $this->orders->owned($id, $this->user($r), $this->token($r, $id));
        $a = $this->payments->attempt($attempt);
        abort_unless($a->order_id === $o->id, 404);
        $this->payments->verify($attempt, 'browser');

        return $this->summary($o->refresh());
    }

    private function summary(Order $o): JsonResponse
    {
        return response()->json(['data' => ['order' => $this->orders->projection($this->orders->read($o), false), 'attempts' => DB::table('payment_attempts')->where('order_id', $o->id)->orderByDesc('created_at')->limit(50)->get()->map(fn ($a) => $this->payments->projection($a))->all()]], 200, ['Cache-Control' => 'no-store']);
    }

    public function adminIndex(Request $r): JsonResponse
    {
        $this->only($r, ['cursor']);
        $r->validate(['cursor' => ['sometimes', 'string', 'max:2048']]);
        /** @var CursorPaginator<int, \stdClass> $page */
        $page = DB::table('payment_attempts')->orderByDesc('created_at')->orderByDesc('id')->cursorPaginate(20);

        return response()->json(['data' => ['items' => $page->getCollection()->map(fn ($a) => $this->adminProjection($a))->all(), 'next_cursor' => $page->nextCursor()?->encode()]], 200, ['Cache-Control' => 'no-store']);
    }

    public function adminShow(Request $r, string $attempt): JsonResponse
    {
        $this->only($r, []);

        return response()->json(['data' => $this->adminProjection($this->payments->attempt($attempt), true)], 200, ['Cache-Control' => 'no-store']);
    }

    public function reconcile(Request $r, string $attempt): JsonResponse
    {
        $this->only($r, []);
        $this->payments->verify($attempt, 'admin', $this->user($r)?->id);

        return response()->json(['data' => $this->adminProjection($this->payments->attempt($attempt), true)], 200, ['Cache-Control' => 'no-store']);
    }

    /** @return array<string,mixed> */
    private function adminProjection(\stdClass $a, bool $detail = false): array
    {
        $o = Order::where('id', $a->order_id)->firstOrFail();
        $data = $this->payments->projection($a) + ['order_id' => $o->id, 'order_number' => $o->public_reference, 'provider' => $a->provider, 'next_check_at' => $a->next_check_at, 'checks' => $a->checks, 'review_reason' => $a->failure_code, 'financial_hold' => $o->financial_hold,
            'receipts' => DB::table('payments')->where('attempt_id', $a->id)->get(['amount_minor', 'currency', 'channel', 'verified_at', 'applied_at', 'exception_code', 'verification_source'])->map(fn ($p) => array_replace((array) $p, ['amount_minor' => (string) $p->amount_minor]))->all()];
        if ($detail) {
            $data['history'] = DB::table('payment_reconciliation_records')->where('attempt_id', $a->id)->orderByDesc('created_at')->limit(100)->get(['source', 'outcome', 'previous_status', 'status', 'created_at'])->map(fn ($h) => (array) $h)->all();
        }

        return $data;
    }
}
