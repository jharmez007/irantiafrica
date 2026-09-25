<?php

use App\Http\Middleware\RequireCsrfToken;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

return [
    'routes' => true,
    'stateful' => array_values(array_filter(explode(',', (string) env('SANCTUM_STATEFUL_DOMAINS', '')))),
    'guard' => ['web'],
    'expiration' => null,
    'token_prefix' => '',
    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => RequireCsrfToken::class,
    ],
];
