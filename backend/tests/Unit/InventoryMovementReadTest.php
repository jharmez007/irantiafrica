<?php

namespace Tests\Unit;

use App\Inventory\InventoryMovementRead;
use PHPUnit\Framework\TestCase;

final class InventoryMovementReadTest extends TestCase
{
    public function test_manual_reasons_are_visible_but_internal_references_are_not(): void
    {
        self::assertSame('New stock received', InventoryMovementRead::reason('ADJUSTMENT', 'New stock received'));
        self::assertSame('Verified opening count', InventoryMovementRead::reason('OPENING', 'Verified opening count'));
        self::assertSame('Inspected saleable return', InventoryMovementRead::reason('RESTOCK', 'Inspected saleable return 11111111-1111-4111-8111-111111111111'));
        self::assertSame('Inventory reservation', InventoryMovementRead::reason('RESERVE', 'Private checkout reference 22222222-2222-4222-8222-222222222222'));
        self::assertSame('Reservation expired', InventoryMovementRead::reason('RELEASE', 'Reservation expired'));
    }

    public function test_actor_label_exposes_only_display_name_or_neutral_fallback(): void
    {
        self::assertSame('Agu John Nnabuke', InventoryMovementRead::recordedBy('staff-id', ' Agu John Nnabuke '));
        self::assertSame('System', InventoryMovementRead::recordedBy(null, null));
        self::assertSame('Unavailable', InventoryMovementRead::recordedBy('former-staff-id', null));
    }
}
