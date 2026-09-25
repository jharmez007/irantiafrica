<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class RequestContext
{
    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        // Generate rather than trust an arbitrary caller's log correlation value.
        $id = (string) Str::uuid();
        $request->attributes->set('request_id', $id);
        Log::withContext(['request_id' => $id]);
        $started = hrtime(true);
        $response = $next($request);
        Log::info('http_request', [
            'method' => $request->method(),
            'route' => $request->route()?->uri(),
            'status' => $response->getStatusCode(),
            'duration_ms' => round((hrtime(true) - $started) / 1_000_000, 2),
        ]);
        $response->headers->set('X-Request-ID', $id);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        if ($request->attributes->get('public_catalog_derivative') !== true) {
            $response->headers->set('Cache-Control', 'no-store');
        }

        return $response;
    }
}
