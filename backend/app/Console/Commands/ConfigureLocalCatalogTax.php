<?php

namespace App\Console\Commands;

use App\Catalog\CatalogTax;
use App\Checkout\CheckoutConfiguration;
use App\Models\User;
use Illuminate\Console\Command;

final class ConfigureLocalCatalogTax extends Command
{
    protected $signature = 'catalog:configure-local-tax {--owner= : Email of an existing Business Owner}';

    protected $description = 'Opt-in development/UAT tax and delivery example; never a production tax policy';

    public function handle(CheckoutConfiguration $configuration, CatalogTax $tax): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('This command is restricted to local and testing environments.');

            return self::FAILURE;
        }

        if ($tax->choices()['data'] !== []) {
            $this->info('An active tax configuration already exists. No configuration was changed.');

            return self::SUCCESS;
        }

        $email = trim((string) $this->option('owner'));
        if ($email === '') {
            $owners = User::where('status', 'active')->whereHas('roles', fn ($query) => $query->where('code', 'owner'))->limit(2)->get();
            if ($owners->count() !== 1) {
                $this->error('Select an existing Business Owner with --owner when there is not exactly one active owner.');

                return self::FAILURE;
            }
            $actor = $owners->first();
        } else {
            $actor = User::where('email', $email)->first();
        }
        if (! $actor || ! $actor->hasPermission('tax.configure') || ! $actor->hasPermission('shipping.configure')) {
            $this->error('The account must be an existing Business Owner with tax and delivery configuration permissions.');

            return self::FAILURE;
        }

        $result = $configuration->publish([
            'version_code' => 'local-uat-'.now()->format('YmdHis').'-'.bin2hex(random_bytes(3)),
            'development_only' => true,
            'payload' => [
                'rounding' => 'HALF_UP',
                'product_rules' => [[
                    'category' => 'STANDARD',
                    'rate' => '0.100000000',
                    'label' => 'Standard tax treatment',
                ]],
                'delivery_tax' => [
                    'taxable' => true,
                    'rate' => '0.100000000',
                    'label' => 'Development example delivery tax',
                ],
                'zones' => [[
                    'code' => 'DEMO_LAGOS',
                    'state_code' => 'LAGOS',
                    'locality_code' => null,
                    'active' => true,
                    'amount_minor' => '505',
                    'provider_label' => 'Development example, not a selected provider',
                    'service_label' => 'Development example delivery',
                    'source_reference' => 'DEVELOPMENT / TEST ONLY - NOT PRODUCTION TAX POLICY',
                ]],
            ],
        ], $actor);

        $this->warn('DEVELOPMENT / TEST ONLY — NOT PRODUCTION TAX POLICY. Sample 10% product and delivery rates; sample Lagos delivery ₦5.05.');
        $this->info('Published local configuration '.$result['version_code'].' with the STANDARD product treatment.');

        return self::SUCCESS;
    }
}
