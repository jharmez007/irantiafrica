<?php

return [
    'internal_read_key' => env('CATALOG_INTERNAL_READ_KEY'),
    'public_requests_per_minute' => max(1, (int) env('RATE_CATALOG_PUBLIC', 120)),
    'renderer_requests_per_minute' => max(1, (int) env('RATE_CATALOG_RENDERER', 3000)),
    'disk' => env('CATALOG_DISK', 'local'),
    'public_origin' => env('CATALOG_MEDIA_ORIGIN'),
    'max_bytes' => 10485760,
    'max_pixels' => 25000000,
    'widths' => [320, 640, 1280],
    'retention_days' => 7,
];
