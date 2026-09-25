<?php

return [
    'max_quantity' => (int) env('CART_MAX_QUANTITY', 99),
    'max_lines' => (int) env('CART_MAX_LINES', 100),
    'guest_retention_days' => (int) env('CART_GUEST_RETENTION_DAYS', 30),
];
