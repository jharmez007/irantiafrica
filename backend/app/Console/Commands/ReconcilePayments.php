<?php

namespace App\Console\Commands;

use App\Jobs\ReconcilePayment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class ReconcilePayments extends Command
{
    protected $signature = 'payments:reconcile {--inline : Process bounded work directly instead of dispatching}';

    protected $description = 'Recover durable webhook inbox and due payment verification';

    public function handle(): int
    {
        foreach (DB::table('webhook_inbox')->whereIn('status', ['PENDING', 'PROCESSING'])->whereRaw('next_attempt_at <= clock_timestamp()')->where(fn ($q) => $q->whereNull('lease_until')->orWhere('lease_until', '<=', now()))->orderBy('received_at')->limit(100)->pluck('id') as $id) {
            $this->runJob(new ReconcilePayment($id, true));
        }
        foreach (DB::table('payment_attempts')->whereIn('status', ['INITIALIZING', 'PENDING', 'UNKNOWN'])->whereRaw('next_check_at <= clock_timestamp()')->where(fn ($q) => $q->whereNull('lease_until')->orWhere('lease_until', '<=', now()))->orderBy('next_check_at')->limit(100)->pluck('id') as $id) {
            $this->runJob(new ReconcilePayment($id));
        }
        $this->info('Bounded payment recovery scan completed.');

        return self::SUCCESS;
    }

    private function runJob(ReconcilePayment $job): void
    {
        if ($this->option('inline')) {
            app()->call([$job, 'handle']);
        } else {
            dispatch($job);
        }
    }
}
