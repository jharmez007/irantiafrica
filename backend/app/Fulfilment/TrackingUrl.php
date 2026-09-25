<?php

namespace App\Fulfilment;

final class TrackingUrl
{
    public static function allowed(string $url): bool
    {
        if (strlen($url) > 2048 || preg_match('/[\s\x00-\x1f\x7f\\\\]/u', $url) || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return false;
        }
        $parts = parse_url($url);
        $hosts = config('shipping.tracking_hosts', []);

        return is_array($parts) && ($parts['scheme'] ?? '') === 'https'
            && ! isset($parts['user']) && ! isset($parts['pass']) && ! isset($parts['port'])
            && is_array($hosts) && in_array(strtolower($parts['host'] ?? ''), $hosts, true);
    }
}
