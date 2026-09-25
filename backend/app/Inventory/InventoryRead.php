<?php

namespace App\Inventory;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use stdClass;

final class InventoryRead
{
    public static function query(): Builder
    {
        return DB::table('product_variants as v')
            ->join('products as p', 'p.id', '=', 'v.product_id')
            ->leftJoin('inventory as i', 'i.variant_id', '=', 'v.id')
            ->select(['v.id as variant_id', 'v.sku', 'v.product_id', 'v.status as variant_status', 'p.name as product_name', 'p.status as product_status', 'i.id as inventory_id', 'i.on_hand', 'i.reserved', 'i.low_stock_threshold', 'i.version']);
    }

    /** @return array<string,mixed> */
    public static function project(stdClass $row, bool $canReadQuantities): array
    {
        $quantity = (int) $row->on_hand - (int) $row->reserved;
        $data = [
            'variant_id' => $row->variant_id, 'sku' => $row->sku,
            'product_id' => $row->product_id, 'product_name' => $row->product_name,
            'variant_status' => $row->variant_status, 'product_status' => $row->product_status,
            'available' => $row->variant_status === 'active' && $quantity > 0,
        ];
        // The approved history grant distinguishes stock operators from availability-only order staff.
        if ($canReadQuantities) {
            $data += ['initialized' => $row->inventory_id !== null,
                'on_hand' => (int) $row->on_hand, 'reserved' => (int) $row->reserved,
                'available_quantity' => $quantity, 'low_stock_threshold' => (int) $row->low_stock_threshold,
                'low_stock' => $row->inventory_id !== null && $quantity <= (int) $row->low_stock_threshold,
                'version' => $row->version === null ? null : (string) $row->version];
        }

        return $data;
    }
}
