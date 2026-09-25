<?php

namespace App\Reporting;

use App\Inventory\InventoryRead;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class StockReport
{
    private function base(): Builder
    {
        return InventoryRead::query()->where('v.status', 'active')->where('p.status', '<>', 'archived');
    }

    /** @return array<string,mixed> */
    public function read(int $page, string $filter = 'all'): array
    {
        // Replace the detail projection before aggregating to avoid grouping live catalog fields.
        $counts = $this->base()->select([])->selectRaw('count(*) as variants, count(i.id) as initialized, count(*) FILTER (WHERE i.id IS NULL) as uninitialized, count(*) FILTER (WHERE i.on_hand-i.reserved<=i.low_stock_threshold) as low_stock, count(*) FILTER (WHERE i.on_hand-i.reserved=0) as out_of_stock')->first();
        $query = $this->base();
        if ($filter === 'low') {
            $query->whereRaw('i.on_hand-i.reserved<=i.low_stock_threshold');
        } elseif ($filter === 'out') {
            $query->whereRaw('i.on_hand-i.reserved=0');
        } elseif ($filter === 'uninitialized') {
            $query->whereNull('i.id');
        }
        $rows = $query->orderBy('v.sku')->orderBy('v.id')->paginate(25, ['*'], 'page', $page);

        return ['scope' => 'Current active variants in non-archived products; independent of date filter', 'counts' => $counts,
            'items' => $rows->getCollection()->map(function ($row): array {
                $data = InventoryRead::project($row, true);
                // Missing balances are unknown, not a claim of zero inventory.
                if (! $data['initialized']) {
                    $data['on_hand'] = $data['reserved'] = $data['available_quantity'] = $data['low_stock_threshold'] = null;
                }

                return $data;
            })->all(), 'pagination' => ['page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()],
            'recent_adjustments' => DB::table('inventory_movements')->whereIn('kind', ['OPENING', 'ADJUSTMENT'])->orderByDesc('created_at')->orderByDesc('id')->limit(10)->get(['id', 'variant_id', 'kind', 'on_hand_delta', 'reserved_delta', 'created_at'])->all()];
    }
}
