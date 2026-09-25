<?php

namespace App\Http\Controllers;

use App\Http\Requests\InventoryRequest;
use App\Inventory\InventoryRead;
use App\Inventory\InventoryService;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class InventoryController
{
    public function __construct(private InventoryService $service) {}

    public function index(InventoryRequest $request): JsonResponse
    {
        $actor = $this->actor($request);
        $canReadQuantities = $actor->hasPermission('inventory.movements.read');
        $query = InventoryRead::query();
        $search = $request->validated('q');
        if (is_string($search) && $search !== '') {
            // Escape LIKE metacharacters; parameter binding also prevents SQL injection.
            $pattern = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn ($q) => $q->where('v.sku', 'ilike', $pattern)->orWhere('p.name', 'ilike', $pattern));
        }
        $page = $query->orderBy('v.sku')->orderBy('v.id')->paginate((int) $request->input('per_page', 25));

        return response()->json(['data' => $page->getCollection()->map(fn ($row) => InventoryRead::project($row, $canReadQuantities)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    public function show(InventoryRequest $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->stock($request, $id)]);
    }

    public function opening(InventoryRequest $request, string $id): JsonResponse
    {
        $movement = $this->service->initializeStock($id, $request->validated('quantity'), $request->validated('reason'), (string) $request->header('Idempotency-Key'), $this->actor($request));

        return response()->json(['data' => $this->stock($request, $id), 'movement_id' => $movement->id]);
    }

    public function adjust(InventoryRequest $request, string $id): JsonResponse
    {
        $movement = $this->service->adjustStock($id, $request->validated('delta'), $request->validated('reason'), (string) $request->header('Idempotency-Key'), $this->actor($request), $request->validated('expected_version'));

        return response()->json(['data' => $this->stock($request, $id), 'movement_id' => $movement->id]);
    }

    public function movements(InventoryRequest $request, string $id): JsonResponse
    {
        ProductVariant::findOrFail($id);
        $owner = $this->actor($request)->hasPermission('inventory.adjust');
        $page = DB::table('inventory_movements as m')->leftJoin('users as u', 'u.id', '=', 'm.actor_user_id')
            ->select(['m.*', 'u.name as actor_name'])->where('m.variant_id', $id)
            ->orderByDesc('m.created_at')->orderByDesc('m.id')->paginate((int) $request->input('per_page', 25));
        $items = $page->getCollection()->map(function ($row) use ($owner): array {
            $data = ['id' => $row->id, 'kind' => $row->kind, 'on_hand_delta' => (int) $row->on_hand_delta,
                'reserved_delta' => (int) $row->reserved_delta, 'on_hand_after' => (int) $row->on_hand_after,
                'reserved_after' => (int) $row->reserved_after, 'reason' => $owner ? $row->reason : 'Operational stock movement',
                'created_at' => $row->created_at];
            if ($owner) {
                $data['actor'] = $row->actor_user_id === null ? null : ['id' => $row->actor_user_id, 'name' => $row->actor_name];
            }

            return $data;
        });

        return response()->json(['data' => $items, 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    private function actor(InventoryRequest $request): User
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);

        return $actor;
    }

    /** @return array<string,mixed> */
    private function stock(InventoryRequest $request, string $id): array
    {
        $row = InventoryRead::query()->where('v.id', $id)->first();
        abort_if($row === null, 404);

        return InventoryRead::project($row, $this->actor($request)->hasPermission('inventory.movements.read'));
    }
}
