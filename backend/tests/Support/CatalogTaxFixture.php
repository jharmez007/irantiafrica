<?php

namespace Tests\Support;

use App\Checkout\CheckoutConfiguration;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Support\Str;

trait CatalogTaxFixture
{
    private function configureCatalogTax(array $codes = ['test', 'unconfigured-test']): void
    {
        $this->seed(IdentityPermissionsSeeder::class);
        $actor = User::factory()->create(['password' => 'Catalog-fixture-passphrase']);
        $actor->roles()->attach(Role::where('code', 'owner')->firstOrFail()->id, ['id' => (string) Str::uuid()]);
        app(CheckoutConfiguration::class)->publish([
            'version_code' => 'catalog-test-'.Str::uuid(), 'development_only' => true,
            'payload' => ['rounding' => 'HALF_UP', 'product_rules' => array_map(fn ($code) => ['category' => $code, 'rate' => '0.1', 'label' => 'Test taxable treatment'], $codes), 'delivery_tax' => ['taxable' => false, 'rate' => null, 'label' => 'Test delivery'], 'zones' => []],
        ], $actor);
    }
}
