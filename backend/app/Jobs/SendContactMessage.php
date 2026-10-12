<?php

namespace App\Jobs;

use App\Communications\ContactMessageMail;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

final class SendContactMessage implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    /** @param array{name:string,email:string,phone:?string,subject:string,message:string} $contact */
    public function __construct(public array $contact) {}

    public function handle(): void
    {
        $recipient = config('contact.recipient');
        if (! is_string($recipient) || ! filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            throw new \LogicException('Contact recipient is not configured.');
        }

        Mail::mailer((string) config('mail.default'))
            ->to($recipient)
            ->send(new ContactMessageMail($this->contact));
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function failed(?\Throwable $exception): void
    {
        // Neither the message nor the transport exception belongs in logs.
        Log::warning('contact_message_delivery_failed', ['error_code' => 'JOB_EXHAUSTED']);
    }
}
