<?php

namespace App\Console\Commands;

use App\Communications\NotificationDelivery;
use Illuminate\Console\Command;

final class RelayNotifications extends Command
{
    protected $signature = 'notifications:relay';

    protected $description = 'Project committed commerce events and queue bounded transactional mail';

    public function handle(NotificationDelivery $delivery): int
    {
        $this->info('Created '.$delivery->relay().' logical notification deliveries.');

        return self::SUCCESS;
    }
}
