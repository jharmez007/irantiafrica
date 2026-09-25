<?php

// Per-minute engineering defaults. Never disable a limiter with zero.
return [
    'identity' => [
        'login' => max(1, (int) env('RATE_IDENTITY_LOGIN', 5)),
        'register' => max(1, (int) env('RATE_IDENTITY_REGISTER', 3)),
        'recovery' => max(1, (int) env('RATE_IDENTITY_RECOVERY', 3)),
        'reset' => max(1, (int) env('RATE_IDENTITY_RESET', 5)),
        'mfa' => max(1, (int) env('RATE_IDENTITY_MFA', 5)),
        'mfa-enroll' => max(1, (int) env('RATE_IDENTITY_MFA_ENROLL', 5)),
        'reauth' => max(1, (int) env('RATE_IDENTITY_REAUTH', 5)),
        'staff' => max(1, (int) env('RATE_IDENTITY_STAFF', 20)),
        'network' => max(1, (int) env('RATE_IDENTITY_NETWORK', 30)),
    ],
    'checkout' => [
        'principal' => max(1, (int) env('RATE_CHECKOUT_PRINCIPAL', 40)),
        'network' => max(1, (int) env('RATE_CHECKOUT_NETWORK', 100)),
    ],
    'payments' => [
        'principal' => max(1, (int) env('RATE_PAYMENTS_PRINCIPAL', 12)),
        'network' => max(1, (int) env('RATE_PAYMENTS_NETWORK', 40)),
    ],
    'orders' => [
        'principal' => max(1, (int) env('RATE_ORDERS_PRINCIPAL', 40)),
        'network' => max(1, (int) env('RATE_ORDERS_NETWORK', 100)),
    ],
    'cart' => [
        'principal' => max(1, (int) env('RATE_CART_PRINCIPAL', 60)),
        'network' => max(1, (int) env('RATE_CART_NETWORK', 120)),
    ],
    'admin' => max(1, (int) env('RATE_ADMIN', 120)),
];
