<?php

namespace Tests\Feature;

use App\Notifications\RecoveryNotification;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class LocalMailCaptureTest extends TestCase
{
    public function test_opt_in_is_ignored_outside_local_and_other_mailer_lists_are_unchanged(): void
    {
        foreach (['local' => 'mailpit', 'testing' => 'array', 'staging' => 'smtp', 'production' => 'smtp'] as $environment => $expected) {
            $process = new Process([PHP_BINARY, '-r', 'require "vendor/autoload.php"; echo json_encode(require "config/mail.php");'], base_path(), ['APP_ENV' => $environment, 'LOCAL_MAILPIT_ENABLED' => 'true', 'MAIL_MAILER' => 'smtp']);
            $process->mustRun();
            $mail = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame($expected, $mail['default']);
            $this->assertSame(['smtp', 'log'], $mail['mailers']['failover']['mailers']);
            $this->assertSame(['ses', 'postmark'], $mail['mailers']['roundrobin']['mailers']);
        }
        $process = new Process([PHP_BINARY, '-r', 'require "vendor/autoload.php"; echo (require "config/mail.php")["default"];'], base_path(), ['APP_ENV' => 'local', 'LOCAL_MAILPIT_ENABLED' => 'false', 'MAIL_MAILER' => 'smtp']);
        $process->mustRun();
        $this->assertSame('array', $process->getOutput());
    }

    public function test_mailpit_configuration_is_loopback_only_and_testing_defaults_to_array(): void
    {
        $this->assertSame('array', config('mail.default'));
        $this->assertSame('127.0.0.1', config('mail.mailers.mailpit.host'));
        $this->assertSame(1025, config('mail.mailers.mailpit.port'));
        $this->assertArrayNotHasKey('url', config('mail.mailers.mailpit'));
        $this->assertSame('smtp', config('mail.mailers.mailpit.scheme'));
    }

    public function test_identity_capture_is_allowed_only_locally(): void
    {
        config(['mail.default' => 'mailpit']);
        $this->app->instance('env', 'local');
        $this->assertSame(['mail'], (new RecoveryNotification('fixture'))->via(null));
        $this->app->instance('env', 'staging');
        $this->expectException(\LogicException::class);
        (new RecoveryNotification('fixture'))->via(null);
    }
}
