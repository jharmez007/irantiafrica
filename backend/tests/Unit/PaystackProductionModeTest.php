<?php

namespace Tests\Unit;

use App\Payments\PaystackGateway;
use Tests\TestCase;

final class PaystackProductionModeTest extends TestCase
{
    public function test_production_can_use_test_credentials_but_live_still_requires_approval(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['payments.enabled' => true, 'payments.return_origin' => 'https://example.com',
            'payments.mode' => 'test', 'payments.secret_key' => 'sk_test_'.str_repeat('0', 32),
            'payments.live_approved' => false]);

        $gateway = new PaystackGateway;
        $this->assertTrue($gateway->ready());

        config(['payments.mode' => 'live', 'payments.secret_key' => 'sk_live_'.str_repeat('0', 32)]);
        $this->assertFalse($gateway->ready());

        config(['payments.live_approved' => true]);
        $this->assertTrue($gateway->ready());
    }
}
