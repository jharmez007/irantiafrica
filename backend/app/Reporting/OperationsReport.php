<?php

namespace App\Reporting;

use Illuminate\Support\Facades\DB;

final class OperationsReport
{
    /** @return array<string,mixed> */
    public function payments(ReportWindow $window): array
    {
        $base = $window->apply(DB::table('payment_attempts'), 'created_at');

        return ['scope' => 'Attempts created in range, current state; attempts are not receipts',
            'counts' => (clone $base)->selectRaw('status,count(*) as count')->groupBy('status')->get()->all(),
            'issues' => (clone $base)->whereIn('status', ['FAILED', 'UNKNOWN', 'REQUIRES_REVIEW', 'INITIALIZING', 'PENDING'])->orderByDesc('created_at')->orderByDesc('id')->limit(10)->get(['id', 'order_id', 'status', 'created_at', 'next_check_at'])->all(),
            'reconciliation_needed' => (clone $base)->whereIn('status', ['INITIALIZING', 'PENDING', 'UNKNOWN', 'REQUIRES_REVIEW'])->count()];
    }

    /** @return array<string,mixed> */
    public function returns(ReportWindow $window, bool $financial): array
    {
        $q = $window->apply(DB::table('return_requests'), 'submitted_at');
        $data = ['scope' => 'Requests submitted in range, current state; queue includes all current open requests',
            'counts' => (clone $q)->selectRaw('status,count(*) as count')->groupBy('status')->get()->all(),
            'open_count' => DB::table('return_requests')->whereNotIn('status', ['CLOSED', 'REJECTED'])->count(),
            'queue' => DB::table('return_requests')->whereNotIn('status', ['CLOSED', 'REJECTED'])->orderBy('submitted_at')->orderBy('id')->limit(10)->get(['id', 'order_id', 'status', 'submitted_at'])->all()];
        if ($financial) {
            $data['refund_counts'] = $window->apply(DB::table('refunds'), 'created_at')->selectRaw('status,count(*) as count')->groupBy('status')->get()->all();
            $data['refund_queue'] = DB::table('refunds')->whereIn('status', ['APPROVED', 'SUBMITTING', 'PENDING', 'UNKNOWN', 'FAILED'])->orderBy('created_at')->orderBy('id')->limit(10)->get(['id', 'order_id', 'status', 'created_at'])->all();
        }

        return $data;
    }

    /** @return array<string,mixed> */
    public function notifications(): array
    {
        return ['scope' => 'Current delivery health, independent of selected dates; no recipient data',
            'enabled' => (bool) config('communications.enabled'),
            'counts' => DB::table('notification_deliveries')->selectRaw('status,count(*) as count')->groupBy('status')->get()->all(),
            'pending_retry' => DB::table('notification_deliveries')->where('status', 'PENDING')->where('attempts', '>', 0)->count()];
    }
}
