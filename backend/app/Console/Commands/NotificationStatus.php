<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class NotificationStatus extends Command
{
    protected $signature = 'notifications:status {--limit=30}';

    protected $description = 'Read safe notification delivery metadata; never render bodies or secrets';

    public function handle(): int
    {
        $limit = max(1, min(100, (int) $this->option('limit')));
        $this->table(['Notification', 'Order', 'Template', 'Recipient', 'Status', 'Attempts', 'Sent', 'Failed', 'Failure'], DB::table('notification_deliveries')->join('outbox_events', 'outbox_events.id', '=', 'notification_deliveries.outbox_event_id')->select('notification_deliveries.*', 'outbox_events.order_id')->orderByDesc('notification_deliveries.created_at')->limit($limit)->get()->map(fn ($d) => [$d->id, $d->order_id, $d->template_code, $d->recipient_masked, $d->status, $d->attempts, $d->sent_at ?? '—', $d->failed_at ?? '—', $d->error_code ?? '—'])->all());
        $this->info('UNKNOWN: investigate provider outcome; never blindly retry. FAILED: inspect safe code and correct configuration/recipient through approved operations. No automatic/manual resend endpoint is enabled.');

        return self::SUCCESS;
    }
}
