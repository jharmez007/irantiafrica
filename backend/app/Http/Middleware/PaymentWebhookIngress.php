<?php

namespace App\Http\Middleware;

use App\Payments\WebhookInbox;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Runs before body transforms/session middleware; only this exact provider POST bypasses browser CSRF. */
final class PaymentWebhookIngress
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('POST') && $request->path() === 'api/v1/webhooks/paystack') {
            abort_if((int) $request->header('Content-Length', '0') > 262144, 413);
            app(WebhookInbox::class)->accept($request->getContent(), $request->header('x-paystack-signature', ''));

            return response()->json(['received' => true], 200, ['Cache-Control' => 'no-store']);
        }

        return $next($request);
    }
}
