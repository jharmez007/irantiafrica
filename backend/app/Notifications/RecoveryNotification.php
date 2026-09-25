<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;

final class RecoveryNotification extends ResetPassword implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(#[\SensitiveParameter] string $token)
    {
        parent::__construct($token);
        $this->onConnection('redis')->onQueue('identity')->afterCommit();
    }

    /** @return list<string> */
    public function via($notifiable): array
    {
        $mailer = (string) config('mail.default');
        if (! in_array($mailer, ['smtp', 'array'], true) || (app()->environment('production') && $mailer !== 'smtp')) {
            throw new \LogicException('Identity mail requires SMTP, or the non-logging array transport outside production.');
        }

        return ['mail'];
    }

    protected function resetUrl($notifiable): string
    {
        // Fragment is not transmitted in HTTP requests, referrers or access logs.
        return rtrim((string) config('identity.frontend_url'), '/').'/reset-password#'.http_build_query([
            'token' => $this->token, 'email' => $notifiable->getEmailForPasswordReset(),
        ]);
    }
}
