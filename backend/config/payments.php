<?php

return [
    'enabled' => (bool) env('PAYMENTS_ENABLED', false),
    'mode' => env('PAYSTACK_MODE', 'test'),
    'secret_key' => env('PAYSTACK_SECRET_KEY', ''),
    'live_approved' => (bool) env('PAYSTACK_LIVE_APPROVED', false),
    'return_origin' => env('FRONTEND_URL', 'http://localhost:3000'),
    // The two already-supported channels are offered on Paystack's hosted page.
    'channels' => ['card', 'bank_transfer'],
    'max_checks' => 12,
];
