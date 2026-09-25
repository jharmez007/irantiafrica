<?php

namespace App\Inventory;

use App\Models\InventoryMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class InventoryAudit
{
    public static function record(InventoryMovement $movement, User $actor, string $hash): void
    {
        DB::table('audit_logs')->insert([
            'id' => (string) Str::uuid7(), 'actor_user_id' => $actor->id, 'actor_type' => 'user',
            'action' => 'inventory.'.strtolower($movement->kind), 'subject_type' => 'inventory_movement',
            'subject_id' => $movement->id, 'outcome' => 'success', 'reason' => $movement->reason,
            'changes' => json_encode(['request_hash' => $hash, 'variant_id' => $movement->variant_id,
                'on_hand_delta' => $movement->on_hand_delta, 'on_hand_after' => $movement->on_hand_after,
                'reserved_after' => $movement->reserved_after], JSON_THROW_ON_ERROR),
            'request_id' => request()->attributes->get('request_id') ?? (string) Str::uuid7(),
            'occurred_at' => now(), 'created_at' => now(),
        ]);
    }
}
