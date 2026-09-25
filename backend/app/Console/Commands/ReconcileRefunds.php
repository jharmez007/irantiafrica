<?php

namespace App\Console\Commands;

use App\Jobs\ReconcileRefund;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class ReconcileRefunds extends Command
{
    protected $signature = 'refunds:reconcile {--inline : Verify bounded work directly}';

    protected $description = 'Verify due refunds without repeating provider refund creation';

    public function handle(): int
    {
        foreach (DB::table('refunds')->whereIn('status', ['SUBMITTING', 'PENDING', 'UNKNOWN'])->where('checks', '<', config('refunds.max_checks'))->where('next_check_at', '<=', now())->where(fn ($q) => $q->whereNull('lease_until')->orWhere('lease_until', '<=', now()))->orderBy('next_check_at')->limit(100)->pluck('id') as $id) {
            $job = new ReconcileRefund($id);
            if ($this->option('inline')) {
                app()->call([$job, 'handle']);
            } else {
                dispatch($job);
            }
        }
        $this->info('Bounded refund verification scan completed.');

        return self::SUCCESS;
    }
}
