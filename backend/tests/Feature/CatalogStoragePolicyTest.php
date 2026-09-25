<?php

namespace Tests\Feature;

use App\Catalog\MediaStorage;
use App\Models\ProductMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class CatalogStoragePolicyTest extends TestCase
{
    public function test_s3_policy_binds_exact_size_key_type_and_short_expiry_without_network(): void
    {
        config(['catalog.disk' => 's3', 'filesystems.disks.s3' => ['driver' => 's3', 'key' => 'synthetic-test-key', 'secret' => 'synthetic-test-secret', 'region' => 'us-east-1', 'bucket' => 'test-private-bucket', 'endpoint' => 'https://storage.example.test', 'use_path_style_endpoint' => true]]);
        Storage::forgetDisk('s3');
        $m = new ProductMedia(['object_key' => 'quarantine/opaque-test-id', 'mime_type' => 'image/png', 'byte_size' => 1234, 'checksum' => str_repeat('a', 64)]);
        $upload = app(MediaStorage::class)->upload($m);
        $this->assertSame('s3-post', $upload['transport']);
        $this->assertSame('https://storage.example.test/test-private-bucket', $upload['url']);
        $policy = json_decode(base64_decode($upload['fields']['Policy']), true, 512, JSON_THROW_ON_ERROR);
        foreach ([['content-length-range', 1234, 1234], ['key' => $m->object_key], ['Content-Type' => 'image/png'], ['x-amz-meta-sha256' => str_repeat('a', 64)]] as $condition) {
            $this->assertContains($condition, $policy['conditions']);
        }
        $this->assertLessThanOrEqual(time() + 601, strtotime($policy['expiration']));
    }

    public function test_media_urls_use_controlled_origin_and_private_preview_without_storage_keys(): void
    {
        config(['catalog.disk' => 's3', 'catalog.public_origin' => 'https://media.example.test']);
        $m = new ProductMedia(['status' => 'ready', 'derivatives' => ['320' => ['key' => 'derivatives/secret-object/320.webp', 'width' => 40, 'height' => 30], '640' => ['key' => 'derivatives/secret-object/640.webp', 'width' => 40, 'height' => 30]]]);
        $m->id = 'image-id';
        $public = app(MediaStorage::class)->sources($m);
        $private = app(MediaStorage::class)->sources($m, false);
        $this->assertCount(1, $public);
        $this->assertStringStartsWith('https://media.example.test/api/v1/media/image-id/', $public[0]['url']);
        $this->assertStringStartsWith('/api/v1/media/image-id/', $private[0]['url']);
        $this->assertStringNotContainsString('secret-object', json_encode($public));
    }

    public function test_private_renderer_budget_does_not_consume_public_client_budget(): void
    {
        config(['catalog.internal_read_key' => str_repeat('a', 64)]);
        $limiter = RateLimiter::limiter('catalog-public');
        $request = Request::create('/api/v1/products');
        $public = $limiter($request);
        $this->assertSame(120, $public->maxAttempts);
        $request->headers->set('X-Catalog-Renderer', 'forged');
        $this->assertSame($public->key, $limiter($request)->key);
        $request->headers->set('X-Catalog-Renderer', str_repeat('a', 64));
        $internal = $limiter($request);
        $this->assertSame(3000, $internal->maxAttempts);
        $this->assertNotSame($public->key, $internal->key);
    }
}
