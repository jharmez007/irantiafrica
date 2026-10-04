<?php

namespace App\Support;

use LogicException;

final class ProductionConfiguration
{
    public static function validateDataPlane(
        string $profile,
        bool $onRender,
        string $databaseDriver,
        string $databaseSslMode,
        string $databaseUrl,
        string $queueDriver,
        string $cacheDriver,
        string $limiterStore,
        string $redisScheme,
        string $redisUrl,
        string $cacheRedisScheme,
        int $retryAfter,
    ): void {
        if ($databaseDriver !== 'pgsql' || $retryAfter <= 60) {
            throw new LogicException('Production requires PostgreSQL and a queue lease longer than the worker timeout.');
        }

        if ($profile === 'render-private-database') {
            if (! $onRender || $databaseSslMode !== 'require' || ! self::urlHasScheme($databaseUrl, ['postgres', 'postgresql'])
                || $queueDriver !== 'database' || $cacheDriver !== 'database' || $limiterStore !== 'database') {
                throw new LogicException('Render database production requires an injected private PostgreSQL URL, TLS, database queue, cache and limiter.');
            }

            return;
        }

        if ($profile === 'render-private') {
            if (! $onRender || $databaseSslMode !== 'require' || ! self::urlHasScheme($databaseUrl, ['postgres', 'postgresql'])
                || $queueDriver !== 'redis' || $cacheDriver !== 'database' || $limiterStore !== 'database'
                || $redisScheme !== 'tcp' || ! self::urlHasScheme($redisUrl, ['redis'])) {
                throw new LogicException('Render private production requires injected datastore URLs, PostgreSQL TLS, database cache and a private Redis queue.');
            }

            return;
        }

        if ($profile !== 'verified-tls' || $queueDriver !== 'redis' || $databaseSslMode !== 'verify-full'
            || $cacheDriver !== 'redis' || $redisScheme !== 'tls' || $cacheRedisScheme !== 'tls') {
            throw new LogicException('Production verified-TLS datastore policy is not satisfied.');
        }
    }

    /** @param array<int, string> $schemes */
    private static function urlHasScheme(string $url, array $schemes): bool
    {
        $parts = parse_url($url);

        return is_array($parts) && in_array($parts['scheme'] ?? '', $schemes, true)
            && isset($parts['host']) && $parts['host'] !== ''
            && ! isset($parts['query']) && ! isset($parts['fragment']);
    }

    public static function secureOrigin(string $origin): bool
    {
        $parts = parse_url($origin);

        return $parts !== false && ($parts['scheme'] ?? '') === 'https'
            && isset($parts['host']) && ! str_contains($origin, '*')
            && ! isset($parts['user']) && ! isset($parts['pass'])
            && ! isset($parts['query']) && ! isset($parts['fragment'])
            && (! isset($parts['path']) || $parts['path'] === '/');
    }

    /** @param array<int, string> $origins */
    public static function validate(bool $debug, bool $secureCookies, string $appUrl, array $origins): void
    {
        if ($debug || ! $secureCookies || ! self::secureOrigin($appUrl)) {
            throw new LogicException('Production configuration requires HTTPS, secure cookies and debug disabled.');
        }
        if ($origins === []) {
            throw new LogicException('Explicit trusted origins are required.');
        }
        foreach ($origins as $origin) {
            if (! self::secureOrigin($origin)) {
                throw new LogicException('Trusted origins must be explicit HTTPS origins.');
            }
        }
    }
}
