<?php

use App\Cart\CartConflict;
use App\Checkout\CheckoutConflict;
use App\Http\Middleware\PaymentWebhookIngress;
use App\Http\Middleware\RequestContext;
use App\Inventory\InventoryConflict;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(PaymentWebhookIngress::class);
        $middleware->prepend(RequestContext::class);
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->report(function (Throwable $exception): bool {
            Log::error('application_exception', ['exception_type' => $exception::class]);

            return false; // No raw exception message, trace arguments or request payload.
        });
        $exceptions->render(function (Throwable $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            $status = $exception instanceof HttpExceptionInterface ? $exception->getStatusCode() : 500;
            if ($exception instanceof AuthenticationException) {
                $status = 401;
            }
            if ($exception instanceof TokenMismatchException) {
                $status = 419;
            }
            $code = match ($status) {
                401 => 'UNAUTHENTICATED',
                403 => 'FORBIDDEN',
                404 => 'NOT_FOUND',
                405 => 'METHOD_NOT_ALLOWED',
                409 => 'CONFLICT',
                419 => 'CSRF_MISMATCH',
                429 => 'RATE_LIMITED',
                503 => 'UNAVAILABLE',
                default => 'INTERNAL_ERROR',
            };
            $fields = [];
            if ($exception instanceof CheckoutConflict) {
                $code = $exception->checkoutCode;
            }
            if ($exception instanceof CartConflict) {
                $code = $exception->cartCode;
            }
            if ($exception instanceof InventoryConflict) {
                $code = $exception->inventoryCode;
            }
            if ($exception instanceof ValidationException) {
                $status = 422;
                $code = 'VALIDATION_ERROR';
                $fields = $exception->errors();
            }
            $requestId = $request->attributes->get('request_id');

            return response()->json(['error' => [
                'code' => $code,
                'message' => ($exception instanceof CartConflict || $exception instanceof CheckoutConflict) ? $exception->getMessage() : ($status >= 500 ? 'The service could not complete the request.' : 'The request could not be completed.'),
                'fields' => $fields,
                'details' => $exception instanceof CheckoutConflict ? $exception->details : [],
                'request_id' => $requestId,
            ]], $status, array_merge($exception instanceof HttpExceptionInterface ? $exception->getHeaders() : [], [
                'X-Request-ID' => is_string($requestId) ? $requestId : '',
                'Cache-Control' => 'no-store',
            ]));
        });
    })->create();
