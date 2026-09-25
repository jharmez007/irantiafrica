<?php

return [
    // Approved Phase 3G engineering default; absolute, never renewed by reads.
    'guest_access_seconds' => (int) env('ORDER_GUEST_ACCESS_SECONDS', 86400),
];
