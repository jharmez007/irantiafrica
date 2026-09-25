<?php

return [
    // Engineering default per generation; final client hold policy remains configurable.
    'reservation_ttl_seconds' => (int) env('INVENTORY_RESERVATION_TTL_SECONDS', 900),
];
