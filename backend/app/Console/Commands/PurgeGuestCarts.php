<?php

namespace App\Console\Commands;

use App\Cart\CartService;
use Illuminate\Console\Command;

class PurgeGuestCarts extends Command
{
    protected $signature = 'cart:purge-guests {--limit=500}';

    protected $description = 'Purge a bounded batch of expired guest carts; preserve authenticated carts';

    public function handle(CartService $cart): int
    {
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10000]]);
        if ($limit === false) {
            $this->error('Limit must be between 1 and 10000.');

            return self::INVALID;
        }
        $this->info('Purged '.$cart->purgeExpiredGuests($limit).' expired guest carts.');

        return self::SUCCESS;
    }
}
