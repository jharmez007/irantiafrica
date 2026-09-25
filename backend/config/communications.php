<?php

return [
    'enabled' => (bool) env('TRANSACTIONAL_EMAIL_ENABLED', false),
    'start_at' => env('TRANSACTIONAL_EMAIL_START_AT'),
    'frontend_origin' => env('FRONTEND_URL', 'http://localhost:3000'),
    'staging_recipient' => env('MAIL_STAGING_RECIPIENT'),
    'reply_to' => env('MAIL_REPLY_TO_ADDRESS'),
    'max_attempts' => 5,
];
