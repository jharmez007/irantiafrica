<?php

namespace App\Console\Commands;

use App\Checkout\CheckoutConfiguration;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class SeedUatAbujaAreas extends Command
{
    protected $signature = 'iranti:seed-uat-abuja-areas {--dry-run : Inspect the local configuration without publishing} {--yes : Publish without an interactive confirmation}';

    protected $description = 'Add explicitly non-production Abuja delivery-area fixtures to the current local shipping configuration';

    public function handle(CheckoutConfiguration $configuration): int
    {
        try {
            $this->assertLocalDatabase();
            $owners = User::where('status', 'active')->whereHas('roles', fn ($query) => $query->where('code', 'owner'))->limit(2)->get();
            $owner = $owners->first();
            if ($owners->count() !== 1 || ! $owner?->hasPermission('tax.configure') || ! $owner->hasPermission('shipping.configure')) {
                throw new \RuntimeException('Exactly one active Business Owner with shipping and tax grants is required.');
            }
            if (DB::table('checkout_sessions')->where('status', 'RESERVED')->whereRaw('expires_at > clock_timestamp()')->exists()) {
                throw new \RuntimeException('A checkout has an unexpired reservation. Finish or let it expire through the normal workflow before publishing new UAT rates.');
            }
            $current = DB::transaction(function () use ($configuration): array {
                CheckoutConfiguration::lock();

                return $configuration->current();
            });
            if ($current['development_only'] !== true) {
                throw new \RuntimeException('Refusing to change a configuration that is not marked development-only.');
            }

            $payload = $current['payload'];
            $added = [];
            foreach (self::areas() as [$name, $amount]) {
                $locality = strtoupper(str_replace(' ', '_', $name));
                $code = 'UAT_FCT_AREA_'.$locality;
                $matches = array_values(array_filter($payload['zones'], fn ($zone) => $zone['state_code'] === 'FCT' && strtoupper(trim((string) ($zone['locality_code'] ?? ''))) === $locality));
                if ($matches !== []) {
                    if (count($matches) === 1 && $matches[0]['code'] === $code && $matches[0]['active'] === true && $matches[0]['amount_minor'] === $amount && $matches[0]['source_reference'] === 'LOCAL/UAT SHIPPING FIXTURES — NOT CLIENT-APPROVED FINAL RATES') {
                        continue;
                    }
                    throw new \RuntimeException($name.' already has a different configured rate. Review it in admin; this command will not overwrite it.');
                }
                foreach ($payload['zones'] as $zone) {
                    if ($zone['code'] === $code) {
                        throw new \RuntimeException($code.' is already used by another zone.');
                    }
                }
                $payload['zones'][] = [
                    'code' => $code,
                    'state_code' => 'FCT',
                    'locality_code' => $locality,
                    'active' => true,
                    'amount_minor' => $amount,
                    'provider_label' => 'IRANTI local/UAT delivery fixture',
                    'service_label' => 'Home delivery',
                    'source_reference' => 'LOCAL/UAT SHIPPING FIXTURES — NOT CLIENT-APPROVED FINAL RATES',
                    'description' => null,
                    'estimate' => null,
                ];
                $added[] = $name;
            }
            $this->warn('LOCAL/UAT SHIPPING FIXTURES — NOT CLIENT-APPROVED FINAL RATES. Never use these rates as production approval.');
            $this->line('Wuse ₦8,000; Maitama ₦5,200; Gwarinpa ₦6,000; Asokoro ₦6,500; Jabi ₦5,500.');
            if ($added === []) {
                $this->info('All five exact fixtures are already present; no configuration was published.');

                return self::SUCCESS;
            }
            $this->line('Areas to add: '.implode(', ', $added).'. Other shipping and tax settings remain in the copied bundle.');
            if ($this->option('dry-run')) {
                $this->info('DRY RUN: no configuration changed.');

                return self::SUCCESS;
            }
            if (! $this->option('yes') && (! $this->input->isInteractive() || ! $this->confirm('Publish these local-only UAT areas?', false))) {
                $this->warn('No configuration changed. Use --yes for an explicit non-interactive run.');

                return self::FAILURE;
            }

            $published = $configuration->publish([
                'version_code' => 'local-uat-abuja-'.now()->format('YmdHis').'-'.bin2hex(random_bytes(3)),
                'expected_current_id' => $current['id'],
                'development_only' => true,
                'payload' => $payload,
            ], $owner);
            $this->info('Published immutable local UAT configuration '.$published['version_code'].'. Historical orders were not changed.');

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            $this->error('Local Abuja area setup stopped: '.$exception->getMessage());
            $this->warn('No database reset, direct stock write or order mutation was performed.');

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

    /** @return list<array{string,string}> */
    private static function areas(): array
    {
        return [
            ['Wuse', '800000'],
            ['Maitama', '520000'],
            ['Gwarinpa', '600000'],
            ['Asokoro', '650000'],
            ['Jabi', '550000'],
        ];
    }
}
