<?php

namespace App\Communications;

final class MailConfiguration
{
    public static function assertRenderProfile(): void
    {
        if (! self::resendConfigured()) {
            throw new \LogicException('Render database production requires Resend HTTPS mail, a configured sender and a private API key.');
        }
    }

    public static function identityTransportConfigured(): bool
    {
        return match (config('mail.default')) {
            'smtp' => true,
            'resend' => self::resendConfigured(),
            'mailpit' => app()->environment('local'),
            'array' => app()->environment(['local', 'testing']),
            default => false,
        };
    }

    public static function senderConfigured(): bool
    {
        $address = config('mail.from.address');
        $name = config('mail.from.name');

        return is_string($address) && filter_var($address, FILTER_VALIDATE_EMAIL)
            && ! preg_match('/@((.*\.)?example\.(com|test|org|net)|.*\.invalid)$/i', $address)
            && is_string($name) && trim($name) !== '';
    }

    public static function resendConfigured(): bool
    {
        $key = config('services.resend.key');

        return config('mail.default') === 'resend' && self::senderConfigured()
            && is_string($key) && preg_match('/^re_[A-Za-z0-9_-]{16,}$/D', $key) === 1;
    }
}
