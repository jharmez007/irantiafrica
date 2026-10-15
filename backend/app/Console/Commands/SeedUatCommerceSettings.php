<?php

namespace App\Console\Commands;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class SeedUatCommerceSettings extends Command
{
    protected $signature = 'iranti:seed-uat-commerce-settings {--dry-run : Check the local database and display the UAT plan without publishing} {--yes : Publish without an interactive confirmation}';

    protected $description = 'Publish six local-only UAT delivery methods and an explicitly non-production 7.5% tax fixture';

    public function handle(CheckoutConfiguration $configuration): int
    {
        try {
            $this->assertLocalDatabase();
            $owners = User::where('status', 'active')->whereHas('roles', fn ($query) => $query->where('code', 'owner'))->limit(2)->get();
            $owner = $owners->first();
            if ($owners->count() !== 1 || ! $owner?->hasPermission('tax.configure') || ! $owner->hasPermission('shipping.configure')) {
                throw new \RuntimeException('Exactly one active Business Owner with shipping and tax grants is required.');
            }
            $categories = DB::table('products')->where('status', 'published')->whereNotNull('tax_category_code')->distinct()->pluck('tax_category_code')->all();
            if (array_diff($categories, ['STANDARD']) !== []) {
                throw new \RuntimeException('Published products use another tax treatment; review them before publishing this STANDARD-only UAT fixture.');
            }

            $payload = self::payload();
            $current = DB::transaction(function () use ($configuration): ?array {
                CheckoutConfiguration::lock();
                try {
                    return $configuration->current();
                } catch (CheckoutConflict $exception) {
                    if ($exception->checkoutCode !== 'TAX_CONFIGURATION_REQUIRED') {
                        throw $exception;
                    }

                    return null;
                }
            });
            if ($current !== null && $current['development_only'] !== true) {
                throw new \RuntimeException('Refusing to replace a configuration that is not marked development-only.');
            }
            $this->warn('DEVELOPMENT/UAT SHIPPING VALUES AND 7.5% TAX RATE ONLY — NOT PRODUCTION APPROVAL OR NIGERIAN TAX POLICY.');
            // PostgreSQL jsonb reorders object keys; compare values without depending on key order.
            if ($current !== null && $current['payload'] == $payload) {
                $this->info('The exact local UAT configuration is already current; no new version was published.');

                return self::SUCCESS;
            }
            $this->line('FCT: Standard ₦4,500; Express ₦7,500. Lagos: Standard ₦5,000; Express ₦8,000. Kaduna: Standard ₦6,000. Rivers: Standard ₦7,000.');
            $this->line('STANDARD product tax: 7.5%. Delivery tax: taxable at 7.5%. Default for new products: STANDARD.');
            if ($this->option('dry-run')) {
                $this->info('DRY RUN: no configuration changed.');

                return self::SUCCESS;
            }
            if (! $this->option('yes') && (! $this->input->isInteractive() || ! $this->confirm('Publish this local-only UAT configuration?', false))) {
                $this->warn('No configuration changed. Use --yes for an explicit non-interactive run.');

                return self::FAILURE;
            }

            $published = $configuration->publish([
                'version_code' => 'local-uat-commerce-'.now()->format('YmdHis').'-'.bin2hex(random_bytes(3)),
                'expected_current_id' => $current['id'] ?? null,
                'development_only' => true,
                'payload' => $payload,
            ], $owner);
            $this->info('Published immutable local UAT configuration '.$published['version_code'].'. Historical orders were not changed.');

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            $this->error('Local UAT commerce configuration stopped: '.$exception->getMessage());
            $this->warn('No database reset or direct configuration row write was performed.');

            return self::FAILURE;
        }
    }

    private function assertLocalDatabase(): void
    {
        $connection = config('database.connections.pgsql');
        if (! app()->environment('local') || config('database.default') !== 'pgsql' ||
            ($connection['host'] ?? null) !== '127.0.0.1' || (int) ($connection['port'] ?? 0) !== 5432 ||
            ($connection['database'] ?? null) !== 'iranti_local') {
            throw new \RuntimeException('Refusing: requires APP_ENV=local and iranti_local PostgreSQL on 127.0.0.1:5432.');
        }
        $server = DB::selectOne('select current_database() as name, inet_server_addr()::text as host, inet_server_port() as port');
        if (! $server || $server->name !== 'iranti_local' || ! in_array($server->host, ['127.0.0.1', '127.0.0.1/32'], true) || (int) $server->port !== 5432) {
            throw new \RuntimeException('Refusing: connected PostgreSQL is not the expected native local database.');
        }
    }

    /** @return array<string,mixed> */
    private static function payload(): array
    {
        $zones = [];
        foreach ([
            ['FCT', 'STANDARD', 'Standard Delivery', '450000'],
            ['FCT', 'EXPRESS', 'Express Delivery', '750000'],
            ['LAGOS', 'STANDARD', 'Standard Delivery', '500000'],
            ['LAGOS', 'EXPRESS', 'Express Delivery', '800000'],
            ['KADUNA', 'STANDARD', 'Standard Delivery', '600000'],
            ['RIVERS', 'STANDARD', 'Standard Delivery', '700000'],
        ] as [$state, $kind, $name, $amount]) {
            $zones[] = [
                'code' => 'UAT_'.$state.'_'.$kind,
                'state_code' => $state,
                'locality_code' => null,
                'active' => true,
                'amount_minor' => $amount,
                'provider_label' => 'IRANTI local/UAT delivery fixture',
                'service_label' => $name,
                'source_reference' => 'LOCAL/UAT TEST VALUE ONLY — NOT APPROVED FOR PRODUCTION',
                'description' => $kind === 'EXPRESS' ? 'Express delivery for this state.' : 'Standard delivery for this state.',
                'estimate' => null,
            ];
        }

        return [
            'rounding' => 'HALF_UP',
            'product_rules' => [[
                'category' => 'STANDARD',
                'rate' => '0.075000000',
                'label' => 'Development/UAT STANDARD test treatment',
            ]],
            'default_tax_category' => 'STANDARD',
            'delivery_tax' => [
                'taxable' => true,
                'rate' => '0.075000000',
                'label' => 'Development/UAT delivery tax test rule',
            ],
            'zones' => $zones,
        ];
    }
}
