<?php

namespace App\Reporting;

use Illuminate\Support\Facades\DB;

final class OrderReport
{
    /** @return array<string,mixed> */
    public function read(ReportWindow $window, int $page, bool $fullPayment = false): array
    {
        $base = $window->apply(DB::table('orders'), 'created_at');
        $counts = array_fill_keys(['PENDING_PAYMENT', 'PAID', 'PAYMENT_REVIEW', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], 0);
        foreach ((clone $base)->selectRaw('status,count(*) as count')->groupBy('status')->get() as $row) {
            $counts[$row->status] = (int) $row->count;
        }
        $detail = (clone $base)->select(['id', 'public_reference', 'status', 'created_at']);
        if ($fullPayment) {
            $detail->addSelect('payment_state');
        } else {
            $detail->selectRaw("CASE WHEN paid_at IS NOT NULL THEN 'PAID' ELSE 'PENDING' END as payment_state");
        }
        $rows = $detail->orderByDesc('created_at')->orderByDesc('id')->paginate(25, ['*'], 'page', $page);

        return ['counts' => $counts, 'scope' => 'Orders created in range, grouped by their current state',
            'items' => $rows->items(), 'pagination' => ['page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()],
            'current_backlog' => DB::table('orders')->whereIn('status', ['PENDING_PAYMENT', 'PAID', 'PAYMENT_REVIEW', 'PROCESSING', 'SHIPPED'])->selectRaw('status,count(*) as count')->groupBy('status')->get()->all()];
    }
}
