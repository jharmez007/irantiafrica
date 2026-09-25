<?php

namespace App\Console\Commands;

use App\Communications\NotificationContent;
use App\Communications\TransactionalMail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

final class PreviewNotification extends Command
{
    protected $signature = 'notifications:preview {event=OrderCreated}';

    protected $description = 'Render synthetic HTML/plain text locally; never query customers or send mail';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('Preview is unavailable outside local/testing.');

            return self::FAILURE;
        }
        $event = $this->argument('event');
        if (! isset(NotificationContent::MATRIX[$event])) {
            $this->error('Select a documented notification event.');

            return self::FAILURE;
        }
        $data = ['event' => $event, 'order_number' => 'IRA-PREVIEW-'.str_repeat('1234567890', 7), 'order_date' => '2026-09-24 09:00 UTC', 'occurred_at' => '2026-09-24 10:00 UTC', 'account_order_id' => '00000000-0000-4000-8000-000000000001', 'guest' => false, 'subtotal_minor' => '1005', 'product_tax_minor' => '101', 'delivery_minor' => '505', 'delivery_tax_minor' => '51', 'total_minor' => '1662', 'items' => [['name' => 'Handwoven heritage basket with natural fibres — a long historical product name for responsive email review', 'quantity' => 3, 'unit_price_minor' => '335']]];
        if (str_starts_with($event, 'Return') || str_starts_with($event, 'Refund')) {
            $data['return_reference'] = '00000000-0000-4000-8000-000000000002';
            $data['return_items'] = [['name' => $data['items'][0]['name'], 'quantity' => 2, 'approved_quantity' => 1]];
        }
        if (str_starts_with($event, 'Refund')) {
            $data['refund_minor'] = '369';
        }
        if ($event === 'OrderShipped') {
            $data['shipment'] = ['carrier' => 'Independent sample carrier', 'tracking_number' => str_repeat('TEST-', 20), 'tracking_url' => null, 'shipped_at' => '2026-09-24 09:30 UTC'];
        }
        $dir = storage_path('app/private/email-previews');
        File::ensureDirectoryExists($dir, 0700);
        File::ensureDirectoryExists($dir.'/assets/brand', 0700);
        File::copy(resource_path('email/logo.png'), $dir.'/assets/brand/horizontal-logo.png');
        $mail = new TransactionalMail($data, '00000000-0000-4000-8000-000000000003');
        File::put($dir.'/'.$event.'.html', $mail->render());
        [$heading,$message] = NotificationContent::MATRIX[$event];
        File::put($dir.'/'.$event.'.txt', view('emails.transactional-text', ['content' => $data, 'heading' => $heading, 'messageText' => $message, 'orderUrl' => NotificationContent::origin().'/account/orders/'.$data['account_order_id']])->render());
        $this->info($dir.'/'.$event.'.html');

        return self::SUCCESS;
    }
}
