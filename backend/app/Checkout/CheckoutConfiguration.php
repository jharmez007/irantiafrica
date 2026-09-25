<?php

namespace App\Checkout;

use App\Cart\CartMoney;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class CheckoutConfiguration
{
    public static function lock(bool $publication = false): void
    {
        DB::select($publication ? 'SELECT pg_advisory_xact_lock(803014)' : 'SELECT pg_advisory_xact_lock_shared(803014)');
    }

    public static function now(): CarbonImmutable
    {
        return new CarbonImmutable(DB::selectOne('SELECT clock_timestamp() AS time')->time);
    }

    /**
     * @param array<string,mixed> $input
     * @return array<string,mixed> */
    public function publish(array $input, User $actor): array
    {
        $data = Validator::make($input, [
            'version_code' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{1,80}$/D'],
            'effective_from' => ['nullable', 'date_format:Y-m-d\TH:i:sP'],
            'development_only' => ['required', function ($a, $v, $f) {
                if (! is_bool($v)) {
                    $f('Use a JSON boolean.');
                }
            }],
            'payload' => ['required', 'array:rounding,product_rules,delivery_tax,zones'],
            'payload.rounding' => ['required', Rule::in(['HALF_UP'])],
            'payload.product_rules' => ['required', 'array', 'list', 'min:1', 'max:100'],
            'payload.product_rules.*' => ['array:category,rate,label'],
            'payload.product_rules.*.category' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{1,64}$/D', 'distinct:strict'],
            'payload.product_rules.*.rate' => ['required', 'string'],
            'payload.product_rules.*.label' => ['required', 'string', 'max:120'],
            'payload.delivery_tax' => ['required', 'array:taxable,rate,label'],
            'payload.delivery_tax.taxable' => ['required', function ($a, $v, $f) {
                if (! is_bool($v)) {
                    $f('Use a JSON boolean.');
                }
            }],
            'payload.delivery_tax.rate' => ['present', 'nullable', 'string'],
            'payload.delivery_tax.label' => ['required', 'string', 'max:120'],
            'payload.zones' => ['present', 'array', 'list', 'max:1000'],
            'payload.zones.*' => ['array:code,state_code,locality_code,active,amount_minor,provider_label,service_label,source_reference'],
            'payload.zones.*.code' => ['required', 'string', 'regex:/^[A-Z0-9_-]{1,64}$/D', 'distinct:strict'],
            'payload.zones.*.state_code' => ['required', Rule::in(array_keys(NigeriaAddress::states()))],
            'payload.zones.*.locality_code' => ['present', 'nullable', 'string', 'regex:/^[A-Z0-9_-]{1,120}$/D'],
            'payload.zones.*.active' => ['required', function ($a, $v, $f) {
                if (! is_bool($v)) {
                    $f('Use a JSON boolean.');
                }
            }],
            'payload.zones.*.amount_minor' => ['required', 'string', 'regex:/^(0|[1-9][0-9]{0,18})$/D'],
            'payload.zones.*.provider_label' => ['required', 'string', 'max:160'],
            'payload.zones.*.service_label' => ['required', 'string', 'max:160'],
            'payload.zones.*.source_reference' => ['required', 'string', 'max:500'],
        ])->validate();
        if (array_diff(array_keys($input), ['version_code', 'effective_from', 'development_only', 'payload'])) {
            throw ValidationException::withMessages(['configuration' => 'Unknown configuration field.']);
        }
        try {
            foreach ($data['payload']['product_rules'] as $r) {
                TaxMath::numerator($r['rate']);
            }
            $delivery = $data['payload']['delivery_tax'];
            if ($delivery['taxable']) {
                TaxMath::numerator($delivery['rate']);
            } elseif ($delivery['rate'] !== null) {
                throw new \InvalidArgumentException('Non-taxable delivery must have a null rate.');
            }
            $destinations = [];
            foreach ($data['payload']['zones'] as $z) {
                CartMoney::line($z['amount_minor'], 1);
                $key = $z['state_code'].':'.($z['locality_code'] ?? '');
                if (isset($destinations[$key])) {
                    throw new \InvalidArgumentException('Ambiguous delivery destination.');
                }
                $destinations[$key] = true;
            }
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages(['configuration' => $e->getMessage()]);
        }
        if (app()->environment('production') && $data['development_only']) {
            throw ValidationException::withMessages(['development_only' => 'Development configuration is prohibited in production.']);
        }

        return DB::transaction(function () use ($data, $actor): array {
            $actor = User::lockForUpdate()->findOrFail($actor->id);
            abort_unless($actor->hasPermission('tax.configure') && $actor->hasPermission('shipping.configure'), 403);
            self::lock(true);
            $now = self::now();
            $start = isset($data['effective_from']) ? new CarbonImmutable($data['effective_from']) : $now;
            $latest = DB::table('checkout_configurations')->orderByDesc('effective_from')->first();
            if ($start->lt($now) || ($latest && $start->lte(new CarbonImmutable($latest->effective_from)))) {
                throw new CheckoutConflict('CONFIGURATION_DATE_CONFLICT', 'Publish at a future time after the latest configuration; historical periods cannot be rewritten.');
            }
            if (DB::table('checkout_configurations')->where('version_code', $data['version_code'])->exists()) {
                throw new CheckoutConflict('CONFIGURATION_VERSION_CONFLICT', 'This configuration version already exists.');
            }
            $id = (string) Str::uuid();
            DB::table('checkout_configurations')->insert(['id' => $id, 'version_code' => $data['version_code'], 'effective_from' => $start->format('Y-m-d H:i:s.uP'), 'payload' => json_encode($data['payload'], JSON_THROW_ON_ERROR), 'development_only' => $data['development_only'], 'approved_by' => $actor->id]);
            DB::table('audit_logs')->insert(['id' => (string) Str::uuid(), 'actor_user_id' => $actor->id, 'actor_type' => 'user', 'action' => 'checkout.configuration_published', 'subject_type' => 'checkout_configuration', 'subject_id' => $id, 'outcome' => 'success', 'changes' => json_encode(['version_code' => $data['version_code'], 'development_only' => $data['development_only']]), 'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid(), 'occurred_at' => $now, 'created_at' => $now]);

            return ['id' => $id, 'version_code' => $data['version_code'], 'effective_from' => $start->toIso8601String(), 'development_only' => $data['development_only']];
        }, 3);
    }

    /** Caller holds configuration transaction lock.
     * @return array<string,mixed> */
    public function current(): array
    {
        $row = DB::table('checkout_configurations')->where('effective_from', '<=', self::now()->format('Y-m-d H:i:s.uP'))->orderByDesc('effective_from')->first();
        if (! $row || (app()->environment('production') && $row->development_only)) {
            throw new CheckoutConflict('TAX_CONFIGURATION_REQUIRED', 'Approved tax and delivery configuration is not available.');
        }

        return ['id' => $row->id, 'version_code' => $row->version_code, 'development_only' => $row->development_only, 'payload' => json_decode($row->payload, true, 512, JSON_THROW_ON_ERROR)];
    }

    /**
     * @param array<string,mixed> $config
     * @param array<string,mixed> $address
     * @return array<string,mixed> */
    public function delivery(array $config, array $address): array
    {
        $zones = array_values(array_filter($config['payload']['zones'], fn ($z) => $z['state_code'] === $address['state_code']));
        $locality = $address['locality_code'] ?? null;
        $matches = array_values(array_filter($zones, fn ($z) => $z['locality_code'] === $locality));
        // An unrecognized supplied locality never silently selects a statewide rate.
        if ($locality !== null && $matches === []) {
            throw new CheckoutConflict('DELIVERY_UNAVAILABLE', 'Select a configured delivery area.');
        }
        if ($matches === []) {
            $matches = array_values(array_filter($zones, fn ($z) => $z['locality_code'] === null));
        }
        if (count($matches) !== 1 || ! $matches[0]['active']) {
            throw new CheckoutConflict('DELIVERY_UNAVAILABLE', 'Delivery is not configured for this destination.');
        }

        return $matches[0];
    }
}
