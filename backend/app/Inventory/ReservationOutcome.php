<?php

namespace App\Inventory;

use App\Models\Reservation;

/** The caller must inspect code; a late consume persists expiry before returning failure. */
final readonly class ReservationOutcome
{
    public function __construct(public string $code, public Reservation $reservation) {}
}
