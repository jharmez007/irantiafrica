<?php

namespace App\Returns;

use App\Checkout\CheckoutConfiguration;
use App\Models\Order;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class ReturnPolicy
{
    public const REASONS = ['DAMAGED_PRODUCT', 'WRONG_PRODUCT_DELIVERED', 'DEFECTIVE_PRODUCT'];

    /** @param array<string,mixed> $input */
    public function publish(array $input, User $actor): string
    {
        $p = $input['policy'];
        if (! in_array($p['anchor'], ['CREATED_AT', 'PAID_AT', 'SHIPPED_AT', 'DELIVERED_AT'], true)
            || ! in_array($p['timezone'], \DateTimeZone::listIdentifiers(), true)
            || ! in_array($p['cutoff'], ['LOCAL_DAY_END', 'ELAPSED_24_HOURS'], true) || $p['eligible_states'] !== ['DELIVERED']
            || $p['delivery_refunds'] !== false || $p['partial_returns'] !== true
            || ! is_bool($p['physical_receipt_required']) || $p['reasons'] !== self::REASONS
            || count($p) !== 8) {
            throw ValidationException::withMessages(['policy' => 'Supply an explicit same-day clock policy, delivered eligibility, approved reasons, receipt requirement, partial returns and delivery_refunds=false.']);
        }
        if ($input['development_only'] && app()->environment('production')) {
            abort(422, 'Development policy cannot be published in production.');
        }
        $id = (string) Str::uuid7();
        DB::transaction(function () use ($input, $actor, $p, $id): void {
            $u = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($u->status === 'active' && $u->hasPermission('returns.decide'), 403);
            DB::table('return_policies')->insert(['id' => $id, 'version_code' => $input['version_code'], 'development_only' => $input['development_only'], 'policy' => json_encode($p, JSON_THROW_ON_ERROR), 'approval_reference' => $input['approval_reference'], 'published_by' => $u->id]);
            ReturnService::audit('policy_published', 'return_policy', $id, $u->id, ['version' => $input['version_code']]);
        }, 3);

        return $id;
    }

    public function current(): ?\stdClass
    {
        $q = DB::table('return_policies');
        if (app()->environment('production')) {
            $q->where('development_only', false);
        }

        return $q->orderByDesc('created_at')->orderByDesc('id')->first();
    }

    /** @return array{eligible:bool,reason:string,anchor:?CarbonImmutable,cutoff:?CarbonImmutable} */
    public function evaluate(Order $o, ?\stdClass $row = null, ?CarbonImmutable $now = null): array
    {
        $row ??= $this->current();
        $no = fn (string $reason): array => ['eligible' => false, 'reason' => $reason, 'anchor' => null, 'cutoff' => null];
        if (! $row) {
            return $no('Return policy is awaiting configuration. Contact the store for assistance.');
        }
        $p = json_decode($row->policy, true);
        if ($o->status !== 'DELIVERED') {
            return $no('A delivered order is required.');
        }
        $value = match ($p['anchor']) {
            'CREATED_AT' => $o->created_at, 'PAID_AT' => $o->paid_at,
            'SHIPPED_AT' => DB::table('shipments')->where('order_id', $o->id)->value('shipped_at'),
            'DELIVERED_AT' => DB::table('shipments')->where('order_id', $o->id)->value('delivered_at'),
            default => null,
        };
        if (! $value) {
            return $no('The policy anchor has not been recorded.');
        }
        $anchor = CarbonImmutable::parse($value);
        // These are distinct explicit policy choices; neither is a production default.
        $cutoff = $p['cutoff'] === 'ELAPSED_24_HOURS' ? $anchor->utc()->addHours(24) : $anchor->setTimezone($p['timezone'])->startOfDay()->addDay()->utc();
        $now ??= CheckoutConfiguration::now();
        $eligible = $now->gte($anchor) && $now->lt($cutoff);

        return ['eligible' => $eligible, 'reason' => $eligible ? 'Same-day request window is open.' : 'The same-day request window has closed.', 'anchor' => $anchor, 'cutoff' => $cutoff];
    }
}
