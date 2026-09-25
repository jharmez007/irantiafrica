<?php

namespace App\Identity;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SecurityEvents
{
    /** @param array<string, mixed> $changes */
    public static function record(string $action, ?User $actor = null, string $outcome = 'success', ?string $subject = null, array $changes = [], ?string $actorType = null): void
    {
        DB::table('audit_logs')->insert([
            'id' => (string) Str::uuid(), 'actor_user_id' => $actor?->id,
            'actor_type' => $actorType ?? ($actor ? 'user' : 'anonymous'), 'action' => $action,
            'subject_type' => 'identity', 'subject_id' => $subject ?? $actor?->id,
            'outcome' => $outcome, 'changes' => json_encode((object) $changes, JSON_THROW_ON_ERROR),
            'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid(),
            'occurred_at' => now(), 'created_at' => now(),
        ]);
    }
}
