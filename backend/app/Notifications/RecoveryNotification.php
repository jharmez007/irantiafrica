<?php

namespace App\Notifications;

use App\Communications\MailConfiguration;
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
        $this->onQueue('identity')->afterCommit();
    }

    /** @return list<string> */
    public function via($notifiable): array
    {
        if (! MailConfiguration::identityTransportConfigured()) {
            throw new \LogicException('Identity mail requires a configured transport.');
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
