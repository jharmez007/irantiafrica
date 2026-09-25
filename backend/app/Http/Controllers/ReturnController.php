<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Orders\OrderService;
use App\Returns\RefundService;
use App\Returns\ReturnPolicy;
use App\Returns\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class ReturnController
{
    public function __construct(private ReturnService $returns, private ReturnPolicy $policies, private OrderService $orders) {}

    /** @param list<string> $keys */
    private function only(Request $r, array $keys): void
    {
        if (array_diff(array_keys($r->all()), $keys)) {
            throw ValidationException::withMessages(['request' => 'Unknown input field.']);
        }
    }

    private function integer(int $minimum = 1): \Closure
    {
        return function ($attribute, $value, $fail) use ($minimum): void {
            if (! is_int($value) || $value < $minimum || $value > 2147483647) {
                $fail('Use a JSON integer within the permitted range.');
            }
        };
    }

    private function token(Request $r, string $id): ?string
    {
        $v = $r->cookie('iranti_order_'.str_replace('-', '', $id));

        return is_string($v) ? $v : null;
    }

    public function index(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);
        $u = $r->user();
        $o = $this->orders->owned($id, $u instanceof User ? $u : null, $this->token($r, $id));
        $eligibility = $this->policies->evaluate($o);
        $items = DB::table('order_items')->where('order_id', $id)->get()->map(fn ($i) => ['order_item_id' => $i->id, 'available_quantity' => $i->quantity - DB::table('return_units')->where('order_item_id', $i->id)->where('active', true)->count()])->all();

        return response()->json(['data' => ['eligibility' => $eligibility, 'reasons' => ReturnPolicy::REASONS, 'items' => $items, 'returns' => DB::table('return_requests')->where('order_id', $id)->orderByDesc('created_at')->get()->map(fn ($v) => $this->returns->projection($v))->all()]]);
    }

    public function create(Request $r, string $id): JsonResponse
    {
        $this->only($r, ['reason_code', 'explanation', 'items']);
        $v = $r->validate(['reason_code' => ['required', 'in:'.implode(',', ReturnPolicy::REASONS)], 'explanation' => ['nullable', 'string', 'max:2000'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*' => ['required', 'array:order_item_id,quantity'], 'items.*.order_item_id' => ['required', 'uuid', 'distinct'], 'items.*.quantity' => ['required', $this->integer()]]);
        $key = $r->header('Idempotency-Key');
        if (! is_string($key) || ! Str::isUuid($key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'Supply a UUID Idempotency-Key.']);
        }
        $u = $r->user();
        $row = $this->returns->create($id, $u instanceof User ? $u : null, $this->token($r, $id), $v, strtolower($key));

        return response()->json(['data' => $this->returns->projection($row)], 201);
    }

    public function adminIndex(Request $r): JsonResponse
    {
        $this->only($r, ['page', 'status']);
        $v = $r->validate(['page' => ['sometimes', 'integer', 'min:1'], 'status' => ['sometimes', 'in:SUBMITTED,UNDER_REVIEW,APPROVED,REJECTED,RECEIVED,CLOSED']]);
        $q = DB::table('return_requests');
        if (isset($v['status'])) {
            $q->where('status', $v['status']);
        }
        $page = $q->orderByDesc('created_at')->orderByDesc('id')->paginate(20);

        return response()->json(['data' => ['returns' => $page->getCollection()->map(fn ($v) => $this->returns->projection($v, $r->user()))->all(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    public function show(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);

        return response()->json(['data' => $this->returns->projection(DB::table('return_requests')->where('id', $id)->firstOrFail(), $r->user())]);
    }

    public function command(Request $r, string $id): JsonResponse
    {
        $action = (string) $r->route('action');
        $this->only($r, in_array($action, ['approve', 'inspect'], true) ? ['expected_version', 'note', 'items'] : ['expected_version', 'note']);
        $rules = ['expected_version' => ['required', $this->integer()], 'note' => ['required', 'string', 'max:1000']];
        if (in_array($action, ['approve', 'inspect'], true)) {
            $field = $action === 'approve' ? 'quantity' : 'disposition';
            $rules += ['items' => ['required', 'array', 'min:1', 'max:100'], 'items.*' => ['required', 'array:return_item_id,'.$field], 'items.*.return_item_id' => ['required', 'uuid', 'distinct'], 'items.*.'.$field => $field === 'quantity' ? ['required', $this->integer(0)] : ['required', 'in:SALEABLE,DAMAGED,QUARANTINED,DISPOSED']];
        }
        $v = $r->validate($rules);
        $u = $r->user();
        abort_unless($u instanceof User, 401);

        return response()->json(['data' => $this->returns->projection($this->returns->act($id, $u, $action, $v), $u)]);
    }

    public function approveRefund(Request $r, string $id): JsonResponse
    {
        $this->only($r, ['expected_version', 'note']);
        $v = $r->validate(['expected_version' => ['required', $this->integer()], 'note' => ['required', 'string', 'max:1000']]);
        $u = $r->user();
        abort_unless($u instanceof User, 401);
        app(RefundService::class)->approve($id, $u, $v['expected_version'], $v['note']);

        return $this->detail($id, $u);
    }

    public function refundCommand(Request $r, string $id): JsonResponse
    {
        $action = (string) $r->route('action');
        $this->only($r, $action === 'reconcile' ? ['provider_refund_id'] : []);
        $v = $r->validate(['provider_refund_id' => ['sometimes', 'string', 'regex:/^[1-9][0-9]{0,19}$/D']]);
        $refund = DB::table('refunds')->where('return_request_id', $id)->firstOrFail();
        $u = $r->user();
        abort_unless($u instanceof User, 401);
        $service = app(RefundService::class);
        if ($action === 'submit') {
            $service->submit($refund->id, $u);
        } else {
            $service->verify($refund->id, 'owner', $v['provider_refund_id'] ?? null, $u->id);
        }

        return $this->detail($id, $u);
    }

    private function detail(string $id, User $u): JsonResponse
    {
        return response()->json(['data' => $this->returns->projection(DB::table('return_requests')->where('id', $id)->firstOrFail(), $u)]);
    }

    public function publish(Request $r): JsonResponse
    {
        $this->only($r, ['version_code', 'development_only', 'approval_reference', 'policy']);
        $v = $r->validate(['version_code' => ['required', 'string', 'max:100', 'unique:return_policies'], 'development_only' => ['required', function ($a, $v, $f) {
            if (! is_bool($v)) {
                $f('Use a JSON boolean.');
            }
        }], 'approval_reference' => ['required', 'string', 'max:500'], 'policy' => ['required', 'array:anchor,timezone,cutoff,eligible_states,delivery_refunds,partial_returns,physical_receipt_required,reasons'], 'policy.anchor' => ['required', 'string'], 'policy.timezone' => ['required', 'string'], 'policy.cutoff' => ['required', 'string'], 'policy.eligible_states' => ['required', 'array'], 'policy.delivery_refunds' => ['required'], 'policy.partial_returns' => ['required'], 'policy.physical_receipt_required' => ['required'], 'policy.reasons' => ['required', 'array']]);
        $u = $r->user();
        abort_unless($u instanceof User, 401);

        return response()->json(['data' => ['id' => $this->policies->publish($v, $u)]], 201);
    }
}
