<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class TrustedBrowser
{
    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->header('Origin');
        if ($origin === null) {
            $referer = parse_url($request->header('Referer', ''));
            $origin = is_array($referer) && isset($referer['scheme'], $referer['host'])
                ? $referer['scheme'].'://'.$referer['host'].(isset($referer['port']) ? ':'.$referer['port'] : '') : '';
        }
        abort_unless(in_array($origin, config('cors.allowed_origins', []), true), 403);
        abort_unless($request->hasSession(), 403);

        return $next($request);
    }
}
