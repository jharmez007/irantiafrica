<?php

return [
    'default' => env('DB_CONNECTION', 'pgsql'),
    'connections' => [
        'pgsql' => [
            'driver' => 'pgsql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_DATABASE', 'iranti_local'),
            'username' => env('DB_USERNAME', 'iranti'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => 'utf8',
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'timezone' => 'UTC',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
            'sslrootcert' => env('DB_SSLROOTCERT'),
        ],
    ],
    'migrations' => ['table' => 'migrations', 'update_date_on_publish' => true],
    'redis' => [
        'client' => env('REDIS_CLIENT', 'predis'),
        'options' => ['prefix' => env('REDIS_PREFIX', 'iranti_local_')],
        'default' => [
            'scheme' => env('REDIS_SCHEME', 'tcp'),
            'ssl' => array_filter(['verify_peer' => true, 'verify_peer_name' => true, 'cafile' => env('REDIS_TLS_CA')], fn ($value) => $value !== null && $value !== ''),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', 63790),
            'database' => env('REDIS_DB', 0),
            'timeout' => 3,
            'read_write_timeout' => 3,
        ],
        'cache' => [
            'scheme' => env('REDIS_CACHE_SCHEME', 'tcp'),
            'ssl' => array_filter(['verify_peer' => true, 'verify_peer_name' => true, 'cafile' => env('REDIS_CACHE_TLS_CA')], fn ($value) => $value !== null && $value !== ''),
            'host' => env('REDIS_CACHE_HOST', '127.0.0.1'),
            'password' => env('REDIS_CACHE_PASSWORD', env('REDIS_PASSWORD')),
            'port' => env('REDIS_CACHE_PORT', 63791),
            'database' => env('REDIS_CACHE_DB', 0),
            'timeout' => 3,
            'read_write_timeout' => 3,
        ],
    ],
];
