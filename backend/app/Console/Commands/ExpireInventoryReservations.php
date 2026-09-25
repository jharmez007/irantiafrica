<?php

namespace App\Console\Commands;

use App\Inventory\InventoryService;
use App\Models\Reservation;
use Illuminate\Console\Command;

class ExpireInventoryReservations extends Command
{
    protected $signature = 'inventory:expire-reservations {--limit=500 : Maximum generations examined per run}';

    protected $description = 'Release due inventory reservations through the retry-safe inventory service';

    public function handle(InventoryService $inventory): int
    {
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10000]]);
        if ($limit === false) {
            $this->error('The limit must be an integer from 1 to 10000.');

            return self::INVALID;
        }
        $ids = Reservation::where('status', 'ACTIVE')->whereRaw('expires_at <= clock_timestamp()')->orderBy('expires_at')->orderBy('id')->limit($limit)->pluck('id');
        $expired = 0;
        foreach ($ids as $id) {
            if ($inventory->expire($id)->code === 'EXPIRED') {
                $expired++;
            }
        }
        $this->info("Processed {$ids->count()} due generations; {$expired} confirmed expired.");

        return self::SUCCESS;
    }
}
