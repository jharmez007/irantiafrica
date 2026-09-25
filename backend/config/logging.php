<?php

use Monolog\Formatter\JsonFormatter;
use Monolog\Handler\NullHandler;
use Monolog\Handler\StreamHandler;

return [
    'default' => env('LOG_CHANNEL', 'stderr'),
    'deprecations' => ['channel' => 'null', 'trace' => false],
    'channels' => [
        'stderr' => [
            'driver' => 'monolog',
            'level' => env('LOG_LEVEL', 'info'),
            'handler' => StreamHandler::class,
            'handler_with' => ['stream' => 'php://stderr'],
            'formatter' => JsonFormatter::class,
        ],
        'null' => ['driver' => 'monolog', 'handler' => NullHandler::class],
        'emergency' => ['path' => storage_path('logs/laravel.log')],
    ],
];
