<?php

namespace App\Identity;

final class StaffInvitationMail
{
    public function status(): string
    {
        $mailer = config('mail.default');

        if (app()->environment('local') && $mailer === 'mailpit') {
            return 'local_capture';
        }

        if ($mailer === 'smtp' && $this->smtpConfigured()) {
            return 'email';
        }

        return 'unavailable';
    }

    public function configured(): bool
    {
        // Automated tests deliberately use the non-delivering array mailer.
        return app()->environment('testing') || $this->status() !== 'unavailable';
    }

    private function smtpConfigured(): bool
    {
        $host = config('mail.mailers.smtp.host');
        $port = config('mail.mailers.smtp.port');
        $from = config('mail.from.address');
        $scheme = config('mail.mailers.smtp.scheme');

        if (! is_string($host) || trim($host) === '' || ! ctype_digit((string) $port)
            || (int) $port < 1 || (int) $port > 65535
            || ! is_string($from) || ! filter_var($from, FILTER_VALIDATE_EMAIL)
            || preg_match('/@((.*\.)?example\.(com|test|org|net)|.*\.invalid)$/i', $from)
            || ! in_array($scheme, [null, 'smtp', 'smtps'], true)
            || config('mail.mailers.smtp.url')) {
            return false;
        }

        // A remote SMTP relay requires credentials. Their presence is checked
        // only on the server and never included in the staff API response.
        if (! in_array(strtolower($host), ['localhost', '127.0.0.1', '::1'], true)) {
            return filled(config('mail.mailers.smtp.username')) && filled(config('mail.mailers.smtp.password'));
        }

        return true;
    }
}
