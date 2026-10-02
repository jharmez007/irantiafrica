<?php

namespace Tests\Infrastructure;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogTax;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ConfigureLocalCatalogTaxTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->seed(IdentityPermissionsSeeder::class);
    }

    public function test_opt_in_local_configuration_supplies_single_default_without_relaxing_publication_guard(): void
    {
        $owner = User::factory()->create();
        $owner->roles()->attach(Role::where('code', 'owner')->firstOrFail()->id, ['id' => (string) Str::uuid()]);

        $this->assertSame([], app(CatalogTax::class)->choices()['data']);
        $this->assertSame(0, Artisan::call('catalog:configure-local-tax', ['--owner' => $owner->email]));
        $choices = app(CatalogTax::class)->choices();
        $this->assertSame([['code' => 'STANDARD', 'label' => 'Standard tax treatment']], $choices['data']);
        $this->assertTrue($choices['development_only']);
        $this->assertSame(0, Artisan::call('catalog:configure-local-tax', ['--owner' => $owner->email]));

        $draft = app(CatalogActions::class)->product(['name' => 'Local UAT draft', 'kind' => 'simple']);
        $this->assertSame('STANDARD', $draft->tax_category_code);
        $this->assertNotEmpty(app(CatalogActions::class)->publicationIssues($draft->load(['categories', 'media', 'variants.selections', 'options'])));
    }
}
