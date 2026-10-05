<?php

namespace App\Support;

use App\Communications\MailConfiguration;

final class DeploymentProfile
{
    public const FREE_TEST_DISK = 'render_free_private';

    public static function isFreeTest(): bool
    {
        return config('production.deployment_profile') === 'render-free-test';
    }

    public static function validate(): void
    {
        $profile = config('production.deployment_profile');
        if (! ProductionConfiguration::secureOrigin((string) config('catalog.public_origin'))) {
            throw new \LogicException('Production catalog requires an HTTPS owned media origin.');
        }

        if ($profile === 'render-free-test') {
            self::validateFreeTest();

            return;
        }
        if ($profile !== 'render-private') {
            throw new \LogicException('Unknown production deployment profile.');
        }
        if (config('catalog.disk') !== 's3') {
            throw new \LogicException('Production catalog requires private S3 storage.');
        }
        if (config('production.network_profile') === 'render-private-database') {
            $s3 = config('filesystems.disks.s3');
            if (config('catalog.upload_transport') !== 'proxy' || ! is_array($s3)
                || ! ProductionConfiguration::secureOrigin((string) ($s3['endpoint'] ?? ''))
                || ($s3['bucket'] ?? '') === '' || ($s3['key'] ?? '') === '' || ($s3['secret'] ?? '') === '') {
                throw new \LogicException('Render database production requires a private HTTPS R2 endpoint, scoped credentials and bounded proxy uploads.');
            }
            MailConfiguration::assertRenderProfile();
        }
    }

    private static function validateFreeTest(): void
    {
        $disk = config('filesystems.disks.'.self::FREE_TEST_DISK);
        $root = storage_path('app/render-free-private');
        // Render documents 0.1 CPU for Free web, but this Free service injected
        // 0.15 at runtime. Both stay below the smallest paid web plan (0.5).
        if (config('production.network_profile') !== 'render-private-database' || ! config('production.render_runtime')
            || ! in_array(config('production.render_cpu_count'), ['0.1', '0.15'], true)
            || config('catalog.disk') !== self::FREE_TEST_DISK || config('filesystems.default') !== self::FREE_TEST_DISK
            || config('catalog.upload_transport') !== 'proxy' || ! is_array($disk)
            || ($disk['driver'] ?? null) !== 'local' || ($disk['root'] ?? null) !== $root
            || ($disk['visibility'] ?? null) !== 'private' || ($disk['serve'] ?? true) !== false
            || ! empty($disk['url']) || config('catalog.public_origin') !== config('app.url')) {
            throw new \LogicException('Render free test requires its isolated private ephemeral media disk and same-origin controlled uploads.');
        }
        foreach (config('filesystems.links', []) as $target) {
            if ($target === $root || str_starts_with($root, rtrim((string) $target, '/').'/')) {
                throw new \LogicException('Render free test media cannot be linked into a public directory.');
            }
        }
        if (! config('production.prelaunch_gate_enabled') || config('payments.mode') !== 'test'
            || config('payments.live_approved') || config('refunds.live_approved')
            || str_starts_with((string) config('payments.secret_key'), 'sk_live_')) {
            throw new \LogicException('Render free test requires the pre-launch gate and TEST-only payment policy.');
        }
        MailConfiguration::assertRenderProfile();
    }
}
