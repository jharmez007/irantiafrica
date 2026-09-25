<?php

namespace App\Reporting;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class SalesReport
{
    public static function paid(ReportWindow $w): Builder
    {
        return $w->apply(DB::table('payments as p')->join('orders as o', 'o.id', '=', 'p.order_id')->whereNotNull('p.applied_at'), 'p.applied_at');
    }

    public static function refunds(ReportWindow $w): Builder
    {
        return $w->apply(DB::table('refunds as r')->where('r.status', 'SUCCEEDED'), 'r.completed_at');
    }

    public static function money(string $minor): string
    {
        $negative = str_starts_with($minor, '-');
        $digits = str_pad(ltrim($minor, '-'), 3, '0', STR_PAD_LEFT);
        $whole = substr($digits, 0, -2);
        $whole = preg_replace('/\B(?=(\d{3})+(?!\d))/', ',', $whole);

        return ($negative ? '-' : '').'NGN '.$whole.'.'.substr($digits, -2);
    }

    /** @return array<string,mixed> */
    public function read(ReportWindow $w): array
    {
        $receipts = self::paid($w)->selectRaw('count(*) as paid_orders, COALESCE(sum(p.amount_minor),0) as gross_minor, COALESCE(sum(o.subtotal_minor),0) as items_minor, COALESCE(sum(o.delivery_minor),0) as delivery_minor, COALESCE(sum(o.tax_minor),0) as tax_minor, count(*) FILTER (WHERE o.financial_hold) as held_orders, COALESCE(sum(p.amount_minor) FILTER (WHERE o.financial_hold),0) as held_minor');
        $refunds = self::refunds($w)->selectRaw('count(*) as completed_refunds, COALESCE(sum(r.amount_minor),0) as refunded_minor');
        $row = DB::query()->fromSub($receipts, 'paid')->crossJoinSub($refunds, 'refunds')->selectRaw('paid.*, refunds.*, (gross_minor-refunded_minor) as net_minor')->first();
        $values = (array) $row;
        $formatted = [];
        foreach ($values as $key => $value) {
            if (str_ends_with($key, '_minor')) {
                $values[$key] = (string) $value;
                $formatted[$key] = self::money((string) $value);
            }
        }
        $unapplied = $w->apply(DB::table('payments')->whereNull('applied_at'), 'verified_at')->count();
        $daily = self::paid($w)->selectRaw('(p.applied_at AT TIME ZONE ?)::date as day, sum(p.amount_minor)::text as gross_minor, count(*) as paid_orders', [$w->timezone])->groupBy('day')->orderBy('day')->get()->map(fn ($d) => ['day' => $d->day, 'paid_orders' => $d->paid_orders, 'gross_minor' => $d->gross_minor, 'gross' => self::money($d->gross_minor)])->all();

        return ['values' => $values, 'formatted' => $formatted, 'unapplied_receipts' => $unapplied, 'daily' => $daily,
            'definition' => 'Gross paid receipts include items, delivery and tax by application date. Net collections subtract successful refunds by completion date. Applied receipts on financial hold remain included and are shown separately; unapplied receipts are excluded. Operational collections, not accounting profit.'];
    }

    /** @return array<string,mixed> */
    public function products(ReportWindow $w, int $page): array
    {
        $sold = self::paid($w)->join('order_items as i', 'i.order_id', '=', 'o.id')->selectRaw("i.variant_id, i.snapshot->>'name' as name, i.snapshot->>'sku' as sku, i.quantity::numeric as units, i.line_subtotal_minor::numeric as gross_minor, 0::numeric as refunded_units, 0::numeric as refunded_base_minor, 0::numeric as refunded_tax_minor");
        $refunded = self::refunds($w)->crossJoin(DB::raw("LATERAL jsonb_array_elements(r.allocation_snapshot->'units') as allocation(unit)"))->join('order_items as i', DB::raw("(allocation.unit->>'order_item_id')::uuid"), '=', 'i.id')->selectRaw("i.variant_id, i.snapshot->>'name' as name, i.snapshot->>'sku' as sku, 0::numeric as units, 0::numeric as gross_minor, 1::numeric as refunded_units, (allocation.unit->>'base_minor')::numeric as refunded_base_minor, (allocation.unit->>'tax_minor')::numeric as refunded_tax_minor");
        $q = DB::query()->fromSub($sold->unionAll($refunded), 'facts')->selectRaw('variant_id,name,sku,sum(units)::text as units,sum(gross_minor)::text as gross_minor,sum(refunded_units)::text as refunded_units,sum(refunded_base_minor)::text as refunded_base_minor,sum(refunded_tax_minor)::text as refunded_tax_minor')->groupBy('variant_id', 'name', 'sku')->orderByRaw('sum(gross_minor) DESC')->orderBy('variant_id')->orderBy('name')->orderBy('sku');
        $rows = $q->paginate(25, ['*'], 'page', $page);

        return ['scope' => 'Historical variant/name/SKU groups ranked by paid item value excluding tax/delivery. Refund unit/base/tax adjustments use completion dates and may relate to earlier sales.',
            'items' => $rows->getCollection()->map(fn ($r) => (array) $r + ['gross' => self::money($r->gross_minor), 'refunded_base' => self::money($r->refunded_base_minor), 'refunded_tax' => self::money($r->refunded_tax_minor)])->all(),
            'pagination' => ['page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()]];
    }
}
