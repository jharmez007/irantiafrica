<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Schedule::command('auth:clear-resets')->hourly()->onOneServer();
Schedule::call(function (): void {
    if (config('cache.default') === 'database') {
        DB::table((string) (config('cache.stores.database.table') ?: 'cache'))->where('expiration', '<=', time())->delete();
        DB::table((string) (config('cache.stores.database.lock_table') ?: 'cache_locks'))->where('expiration', '<=', time())->delete();
    }
})->name('database-cache-cleanup')->hourly()->onOneServer();
Schedule::call(function (): void {
    DB::table('sessions')->where('last_activity', '<=', time() - ((int) config('session.lifetime') * 60))->delete();
})->name('identity-session-cleanup')->hourly()->onOneServer();

Schedule::command('catalog:media-maintenance')->hourly()->withoutOverlapping()->onOneServer();

Schedule::command('inventory:expire-reservations')->everyMinute()->withoutOverlapping(5)->onOneServer();

Schedule::command('cart:purge-guests')->hourly()->withoutOverlapping(5)->onOneServer();

Schedule::command('checkout:expire')->everyMinute()->withoutOverlapping(5)->onOneServer();

Schedule::command('payments:reconcile')->everyMinute()->withoutOverlapping(5)->onOneServer();

Schedule::command('refunds:reconcile')->everyMinute()->withoutOverlapping(5)->onOneServer();

Schedule::command('notifications:relay')->everyMinute()->withoutOverlapping(5)->onOneServer();
