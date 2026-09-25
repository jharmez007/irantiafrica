<?php

namespace App\Catalog;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class CatalogAudit
{
    /** @param array<string, mixed> $changes */
    public static function record(string $action, string $type, string $id, array $changes = []): void
    {
        $actor = request()->user();
        DB::table('audit_logs')->insert(['id' => (string) Str::uuid(), 'actor_user_id' => $actor?->getAuthIdentifier(), 'actor_type' => $actor ? 'user' : 'service', 'action' => 'catalog.'.$action, 'subject_type' => $type, 'subject_id' => $id, 'outcome' => 'success', 'changes' => json_encode((object) $changes, JSON_THROW_ON_ERROR), 'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid(), 'occurred_at' => now(), 'created_at' => now()]);
    }
}
