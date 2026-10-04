<?php

return [
    'absolute_seconds' => (int) env('AUTH_ABSOLUTE_SECONDS', 43200),
    // Production defaults retain the approved shorter staff policy. Local UAT
    // explicitly opts into a 24-hour session and MFA trust window.
    'staff_pending_seconds' => (int) env('AUTH_STAFF_PENDING_SECONDS', 600),
    'staff_idle_seconds' => (int) env('AUTH_STAFF_IDLE_SECONDS', 900),
    'staff_absolute_seconds' => (int) env('AUTH_STAFF_ABSOLUTE_SECONDS', 28800),
    'staff_mfa_trust_seconds' => (int) env('AUTH_STAFF_MFA_TRUST_SECONDS', 28800),
    'frontend_url' => env('APP_URL', 'http://localhost:3000'),
];
