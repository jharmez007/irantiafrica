<?php

namespace App\Communications;

use Illuminate\Mail\Mailable;
use Symfony\Component\Mime\Email;

final class TransactionalMail extends Mailable
{
    /** @param array<string,mixed> $data */
    public function __construct(public array $data, public string $deliveryId) {}

    public function build(): static
    {
        [$heading,$message] = NotificationContent::MATRIX[$this->data['event']];
        $origin = NotificationContent::origin();
        $url = $this->data['account_order_id'] ? $origin.'/account/orders/'.$this->data['account_order_id'] : null;
        if (isset($this->data['shipment'])) {
            $this->data['shipment']['tracking_url'] = NotificationContent::tracking($this->data['shipment']['tracking_url']);
        }
        $this->subject($heading.' · '.$this->data['order_number'])->view('emails.transactional')->text('emails.transactional-text')->with(['content' => $this->data, 'heading' => $heading, 'messageText' => $message, 'orderUrl' => $url, 'logoUrl' => $origin.'/assets/brand/horizontal-logo.png']);
        $this->withSymfonyMessage(function (Email $email): void {
            $email->getHeaders()->addIdHeader('Message-ID', $this->deliveryId.'@'.(explode('@', (string) config('mail.from.address'), 2)[1] ?? 'notifications.invalid'));
            $email->getHeaders()->addTextHeader('X-Auto-Response-Suppress', 'All');
        });
        if (config('communications.reply_to')) {
            $this->replyTo(config('communications.reply_to'));
        }

        return $this;
    }
}
