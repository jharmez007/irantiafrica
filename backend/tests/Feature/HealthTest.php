<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

final class HealthTest extends TestCase
{
    public function test_health_boots_without_disclosing_infrastructure(): void
    {
        $response = $this->getJson('/api/v1/health');
        $response->assertOk()->assertExactJson(['data' => ['status' => 'ok']]);
        $response->assertHeader('X-Request-ID');
        $response->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_api_not_found_uses_safe_error_contract(): void
    {
        $this->getJson('/api/v1/does-not-exist')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND')
            ->assertJsonStructure(['error' => ['request_id']]);
    }

    public function test_unexpected_error_does_not_expose_exception_message(): void
    {
        config(['app.debug' => false]);
        $this->app->instance('env', 'production');
        Route::get('/api/v1/foundation-error', function (): never {
            throw new RuntimeException('sensitive-internal-marker');
        });
        $response = $this->getJson('/api/v1/foundation-error');
        $response->assertStatus(500)->assertJsonPath('error.code', 'INTERNAL_ERROR');
        $this->assertStringNotContainsString('sensitive-internal-marker', $response->getContent());
    }

    public function test_untrusted_origin_is_not_allowed(): void
    {
        $response = $this->withHeader('Origin', 'https://untrusted.example.test')
            ->getJson('/api/v1/health');
        // A fixed approved origin also denies other origins at the browser boundary.
        $this->assertNotSame('https://untrusted.example.test', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
