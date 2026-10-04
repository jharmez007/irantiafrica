<?php

namespace App\Inventory;

/** Inventory-facing projection; automatic/internal references never become staff notes. */
final class InventoryMovementRead
{
    public static function reason(string $kind, ?string $storedReason): string
    {
        return match ($kind) {
            'OPENING', 'ADJUSTMENT' => is_string($storedReason) && trim($storedReason) !== '' ? $storedReason : 'Stock count or adjustment',
            'RESERVE' => 'Inventory reservation',
            'SALE' => 'Stock sold from reservation',
            'RELEASE' => $storedReason === 'Reservation expired' ? 'Reservation expired' : 'Reservation released',
            'RESTOCK' => 'Inspected saleable return',
            default => 'Inventory movement',
        };
    }

    public static function recordedBy(?string $actorId, ?string $actorName): string
    {
        $name = is_string($actorName) ? trim($actorName) : '';

        return $name !== '' ? $name : ($actorId === null ? 'System' : 'Unavailable');
    }
}
