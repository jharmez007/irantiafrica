<?php

namespace Tests\Feature;

use App\Catalog\MediaStorage;
use App\Models\ProductMedia;
use App\Support\DeploymentProfile;
use App\Support\ProductionConfiguration;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class DeploymentProfileTest extends TestCase
{
    public function test_render_true_environment_value_is_recognized(): void
    {
        $process = new Process([PHP_BINARY, '-r', 'require "vendor/autoload.php"; $app = require "bootstrap/app.php"; $app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); echo config("production.render_runtime") ? "render" : "not-render";'], base_path(), [
            'APP_ENV' => 'testing', 'RENDER' => 'true', 'RENDER_SERVICE_ID' => 'srv-synthetic-test',
        ]);
        $process->mustRun();
        $this->assertSame('render', $process->getOutput());
    }

    private function freeTestProfile(): void
    {
        config([
            'production.deployment_profile' => 'render-free-test',
            'production.network_profile' => 'render-private-database',
            'production.render_runtime' => true,
            'production.render_cpu_count' => '0.1',
            'production.prelaunch_gate_enabled' => false,
            'production.preview_noindex' => true,
            'app.url' => 'https://iranti-africa-free-test.onrender.com',
            'catalog.public_origin' => 'https://iranti-africa-free-test.onrender.com',
            'catalog.disk' => DeploymentProfile::FREE_TEST_DISK,
            'catalog.upload_transport' => 'proxy',
            'filesystems.default' => DeploymentProfile::FREE_TEST_DISK,
            'payments.mode' => 'test',
            'payments.live_approved' => false,
            'refunds.live_approved' => false,
            'mail.default' => 'resend',
            'mail.from.address' => 'sender@irantiafrica.com',
            'mail.from.name' => 'IRANTI Africa',
            'services.resend.key' => 're_'.str_repeat('x', 24),
        ]);
    }

    public function test_explicit_free_test_profile_uses_only_private_controlled_ephemeral_media(): void
    {
        $this->freeTestProfile();
        DeploymentProfile::validate();
        config(['production.render_cpu_count' => '0.15']);
        DeploymentProfile::validate();
        $this->assertTrue(DeploymentProfile::isFreeTest());
        $this->assertFalse(Route::has('storage.render_free_private'));
        $this->assertFalse(config('filesystems.disks.render_free_private.serve'));
        $this->assertStringStartsWith(storage_path('app/'), config('filesystems.disks.render_free_private.root'));
        $this->assertFalse(str_starts_with(config('filesystems.disks.render_free_private.root'), public_path().'/'));
        $media = new ProductMedia(['status' => 'ready', 'derivatives' => ['320' => ['key' => 'private/opaque.webp', 'width' => 320, 'height' => 240]]]);
        $media->id = 'test-media-id';
        $this->assertSame('https://iranti-africa-free-test.onrender.com/api/v1/media/test-media-id/320', app(MediaStorage::class)->sources($media)[0]['url']);
        $this->assertStringNotContainsString('opaque.webp', app(MediaStorage::class)->sources($media)[0]['url']);
    }

    public function test_paid_profile_keeps_private_r2_requirements(): void
    {
        $this->freeTestProfile();
        config(['production.deployment_profile' => 'render-private', 'catalog.disk' => 's3', 'filesystems.default' => 's3']);
        try {
            DeploymentProfile::validate();
            $this->fail('The paid profile accepted missing R2.');
        } catch (\LogicException) {
            $this->addToAssertionCount(1);
        }
        config(['filesystems.disks.s3' => ['driver' => 's3', 'endpoint' => 'https://storage.example.test',
            'bucket' => 'private-test-bucket', 'key' => 'synthetic-key', 'secret' => 'synthetic-secret']]);
        DeploymentProfile::validate();
        $this->assertFalse(DeploymentProfile::isFreeTest());
    }

    public function test_free_private_media_upload_uses_signed_application_endpoint(): void
    {
        $this->freeTestProfile();
        DeploymentProfile::validate();
        Storage::fake(DeploymentProfile::FREE_TEST_DISK);
        $media = new ProductMedia(['object_key' => 'quarantine/opaque-test-id', 'mime_type' => 'image/png',
            'byte_size' => 7, 'checksum' => hash('sha256', 'fixture')]);
        $media->id = (string) Str::uuid();
        $storage = app(MediaStorage::class);
        $upload = $storage->upload($media);
        $this->assertSame('local', $upload['transport']);
        $this->assertStringContainsString('/api/v1/admin/media/'.$media->id.'/upload', $upload['url']);
        $this->assertStringContainsString('signature=', $upload['url']);
        $this->assertStringNotContainsString('storage/app/', $upload['url']);
        $this->assertTrue($storage->putPrivate($media->object_key, 'fixture', 'image/png'));
        $this->assertSame('fixture', Storage::disk(DeploymentProfile::FREE_TEST_DISK)->get($media->object_key));
    }

    public function test_missing_typo_or_non_render_profile_cannot_activate_free_media(): void
    {
        $this->freeTestProfile();
        foreach (['render-private', 'render-free-tset', null] as $profile) {
            config(['production.deployment_profile' => $profile]);
            $this->expectProfileRejection();
        }
        config(['production.deployment_profile' => 'render-free-test', 'production.render_runtime' => false]);
        $this->expectProfileRejection();
        config(['production.render_runtime' => true, 'production.network_profile' => 'verified-tls']);
        $this->expectProfileRejection();
        config(['production.network_profile' => 'render-private-database', 'production.render_cpu_count' => '1']);
        $this->expectProfileRejection();
        config(['production.render_cpu_count' => '0.5']);
        $this->expectProfileRejection();
    }

    public function test_free_media_rejects_public_route_link_or_non_private_disk(): void
    {
        $this->freeTestProfile();
        $links = config('filesystems.links');
        config(['filesystems.disks.render_free_private.serve' => true]);
        $this->expectProfileRejection();
        config(['filesystems.disks.render_free_private.serve' => false,
            'filesystems.links.extra' => storage_path('app/render-free-private')]);
        $this->expectProfileRejection();
        config(['filesystems.links' => $links, 'catalog.upload_transport' => 's3-post']);
        $this->expectProfileRejection();
    }

    public function test_free_preview_retains_noindex_test_payments_resend_and_debug_protection(): void
    {
        $this->freeTestProfile();
        foreach ([
            ['production.preview_noindex', false],
            ['payments.mode', 'live'],
            ['payments.live_approved', true],
            ['refunds.live_approved', true],
            ['payments.secret_key', 'sk_live_fixture'],
            ['services.resend.key', null],
            ['mail.default', 'smtp'],
        ] as [$key, $unsafe]) {
            $previous = config($key);
            config([$key => $unsafe]);
            $this->expectProfileRejection();
            config([$key => $previous]);
        }
        $this->expectException(\LogicException::class);
        ProductionConfiguration::validate(true, true, 'https://iranti-africa-free-test.onrender.com', ['https://iranti-africa-free-test.onrender.com']);
    }

    private function expectProfileRejection(): void
    {
        try {
            DeploymentProfile::validate();
            $this->fail('Unsafe deployment profile was accepted.');
        } catch (\LogicException) {
            $this->addToAssertionCount(1);
        }
    }
}
