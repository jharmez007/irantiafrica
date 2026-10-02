<?php

return [
    // Engineering default per generation; final client hold policy remains configurable.
    'reservation_ttl_seconds' => (int) env('INVENTORY_RESERVATION_TTL_SECONDS', 900),
    // Five is representative local UAT configuration, not production stock policy.
    'low_stock_threshold' => (int) env('INVENTORY_LOW_STOCK_THRESHOLD', env('APP_ENV') === 'local' ? 5 : 0),
];
