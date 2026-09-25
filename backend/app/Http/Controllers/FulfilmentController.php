<?php

namespace App\Http\Controllers;

use App\Fulfilment\FulfilmentService;
use App\Models\Order;
use App\Models\User;
use App\Orders\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class FulfilmentController
{
    public function __construct(private FulfilmentService $fulfilment, private OrderService $orders) {}

    public function show(Request $r, string $id): JsonResponse
    {
        abort_unless($r->user() instanceof User, 401);

        return response()->json(['data' => $this->fulfilment->adminProjection(Order::findOrFail($id), $r->user())]);
    }

    public function command(Request $r, string $id): JsonResponse
    {
        $actor = $r->user();
        abort_unless($actor instanceof User, 401);
        $action = (string) $r->route('action');
        $shipment = in_array($action, ['create', 'update'], true);
        $keys = $shipment ? ['expected_version', 'provider_label', 'tracking_number', 'tracking_url', 'operational_notes'] : ['expected_version', 'note'];
        if (array_diff(array_keys($r->all()), $keys)) {
            throw ValidationException::withMessages(['request' => 'Unknown input field.']);
        }
        $text = ['nullable', 'string', 'max:1000', 'regex:/^[^\p{C}]+$/u'];
        $rules = ['expected_version' => ['required', function ($a, $v, $fail) {
            if (! is_int($v) || $v < 1 || $v > 2147483647) {
                $fail('Use a positive JSON integer version.');
            }
        }]];
        $rules += $shipment ? ['provider_label' => ['required', 'string', 'max:160', 'regex:/^[^\p{C}]+$/u'], 'tracking_number' => ['nullable', 'string', 'max:160', 'regex:/^[^\p{C}]+$/u'], 'tracking_url' => ['nullable', 'string', 'max:2048'], 'operational_notes' => $text] : ['note' => $action === 'deliver' ? ['required', 'string', 'max:1000', 'regex:/^[^\p{C}]+$/u'] : ($action === 'processing' ? ['nullable', 'string', 'max:500', 'regex:/^[^\p{C}]+$/u'] : $text)];
        $input = $r->validate($rules);
        if ($shipment) {
            foreach (['tracking_number', 'tracking_url', 'operational_notes'] as $key) {
                $input[$key] ??= null;
            }
        }
        $o = $this->fulfilment->act($id, $actor, $action, $input);
        $data = $this->orders->projection($o);
        if (! $actor->hasPermission('payments.reconcile')) {
            $data['payment'] = ['state' => $o->paid_at ? 'SUCCESSFUL' : 'PENDING', 'available' => false];
        }
        $data['fulfilment'] = $this->fulfilment->adminProjection($o, $actor);

        return response()->json(['data' => $data]);
    }
}
