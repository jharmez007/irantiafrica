<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CartIdentity
{
    /** @param Closure(Request):Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        return $request->user() === null ? $next($request) : app(CurrentIdentity::class)->handle($request, $next);
    }
}
