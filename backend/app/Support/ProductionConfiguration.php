<?php

namespace App\Support;

use LogicException;

final class ProductionConfiguration
{
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
