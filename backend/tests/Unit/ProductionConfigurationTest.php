<?php

namespace Tests\Unit;

use App\Support\ProductionConfiguration;
use LogicException;
use PHPUnit\Framework\TestCase;

final class ProductionConfigurationTest extends TestCase
{
    public function test_ultra_lean_render_profile_accepts_only_database_queue_and_cache(): void
    {
        ProductionConfiguration::validateDataPlane('render-private-database', true, 'pgsql', 'require', 'postgresql://user:pass@db.internal/db', 'database', 'database', 'database', 'tcp', '', 'tcp', 90);
        $this->addToAssertionCount(1);

        $this->expectException(LogicException::class);
        ProductionConfiguration::validateDataPlane('render-private-database', true, 'pgsql', 'require', 'postgresql://user:pass@db.internal/db', 'redis', 'database', 'database', 'tcp', '', 'tcp', 90);
    }

    public function test_ultra_lean_render_profile_rejects_unsafe_tls_or_lease(): void
    {
        foreach ([['prefer', 90], ['require', 60]] as [$sslMode, $lease]) {
            try {
                ProductionConfiguration::validateDataPlane('render-private-database', true, 'pgsql', $sslMode, 'postgresql://user:pass@db.internal/db', 'database', 'database', 'database', 'tcp', '', 'tcp', $lease);
                $this->fail('Unsafe production datastore configuration was accepted.');
            } catch (LogicException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_render_private_data_plane_requires_tls_and_database_cache(): void
    {
        ProductionConfiguration::validateDataPlane('render-private', true, 'pgsql', 'require', 'postgresql://user:pass@db.internal/db', 'redis', 'database', 'database', 'tcp', 'redis://queue.internal:6379', 'tcp', 90);
        $this->addToAssertionCount(1);

        $this->expectException(LogicException::class);
        ProductionConfiguration::validateDataPlane('render-private', true, 'pgsql', 'prefer', 'postgresql://user:pass@db.internal/db', 'redis', 'database', 'database', 'tcp', 'redis://queue.internal:6379', 'tcp', 90);
    }

    public function test_render_private_profile_rejects_non_render_runtime(): void
    {
        $this->expectException(LogicException::class);
        ProductionConfiguration::validateDataPlane('render-private', false, 'pgsql', 'require', 'postgresql://user:pass@db.internal/db', 'redis', 'database', 'database', 'tcp', 'redis://queue.internal:6379', 'tcp', 90);
    }

    public function test_render_private_profile_rejects_url_overrides(): void
    {
        $this->expectException(LogicException::class);
        ProductionConfiguration::validateDataPlane('render-private', true, 'pgsql', 'require', 'postgresql://user:pass@db.internal/db?sslmode=disable', 'redis', 'database', 'database', 'tcp', 'redis://queue.internal:6379', 'tcp', 90);
    }

    public function test_existing_verified_tls_profile_remains_valid(): void
    {
        ProductionConfiguration::validateDataPlane('verified-tls', false, 'pgsql', 'verify-full', '', 'redis', 'redis', 'identity_limits', 'tls', '', 'tls', 90);
        $this->addToAssertionCount(1);
    }

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
