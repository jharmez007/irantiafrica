<?php

namespace Tests\Unit;

use App\Support\ProductionConfiguration;
use LogicException;
use PHPUnit\Framework\TestCase;

final class ProductionConfigurationTest extends TestCase
{
    public function test_malformed_application_origins_are_rejected(): void
    {
        foreach (['https://', 'https://user:password@store.example.test', 'https://store.example.test/path', 'https://store.example.test?token=value', 'https://*.example.test'] as $origin) {
            $this->assertFalse(ProductionConfiguration::secureOrigin($origin));
        }
    }

    public function test_wildcard_origin_is_rejected(): void
    {
        $this->expectException(LogicException::class);
        ProductionConfiguration::validate(false, true, 'https://store.example.test', ['*']);
    }

    public function test_production_debug_is_rejected(): void
    {
        $this->expectException(LogicException::class);
        ProductionConfiguration::validate(true, true, 'https://store.example.test', ['https://store.example.test']);
    }

    public function test_explicit_secure_configuration_is_accepted(): void
    {
        ProductionConfiguration::validate(false, true, 'https://store.example.test', ['https://store.example.test']);
        $this->addToAssertionCount(1);
    }
}
