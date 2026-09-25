<?php

return [
    // Exact, client-approved HTTPS hostnames. Empty means tracking URLs fail closed.
    'tracking_hosts' => array_values(array_filter(array_map('trim', explode(',', (string) env('SHIPPING_TRACKING_HOSTS', ''))))),
];
