<?php

namespace App\Console\Commands;

use App\Checkout\CheckoutService;
use Illuminate\Console\Command;

class ExpireCheckouts extends Command
{
    protected $signature = 'checkout:expire {--limit=500}';

    protected $description = 'Reconcile expired checkout attempts and release holds safely';

    public function handle(CheckoutService $checkout): int
    {
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10000]]);
        if ($limit === false) {
            $this->error('Limit must be 1–10000.');

            return self::INVALID;
        }
        $this->info('Reconciled '.$checkout->expireDue($limit).' checkout attempts.');

        return self::SUCCESS;
    }
}
