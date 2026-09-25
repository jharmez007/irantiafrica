<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Schedule::command('auth:clear-resets')->hourly();
Schedule::call(function (): void {
    DB::table('sessions')->where('last_activity', '<=', time() - ((int) config('session.lifetime') * 60))->delete();
})->name('identity-session-cleanup')->hourly();

Schedule::command('catalog:media-maintenance')->hourly()->withoutOverlapping();

Schedule::command('inventory:expire-reservations')->everyMinute()->withoutOverlapping(5);

Schedule::command('cart:purge-guests')->hourly()->withoutOverlapping(5);

Schedule::command('checkout:expire')->everyMinute()->withoutOverlapping(5);

Schedule::command('payments:reconcile')->everyMinute()->withoutOverlapping(5);

Schedule::command('refunds:reconcile')->everyMinute()->withoutOverlapping(5);

Schedule::command('notifications:relay')->everyMinute()->withoutOverlapping(5);
