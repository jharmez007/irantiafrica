<?php

namespace App\Providers;

use App\Identity\MfaState;
use App\Identity\PermissionMatrix;
use App\Models\User;
use App\Payments\PaymentGateway;
use App\Payments\PaystackGateway;
use App\Support\ProductionConfiguration;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PaymentGateway::class, PaystackGateway::class);
    }

    public function boot(): void
    {
        Queue::before(function (JobProcessing $event): void {
            Log::info('queue_job_started', ['job_id' => $event->job->getJobId(), 'job_type' => $event->job->resolveName(), 'queue' => $event->job->getQueue()]);
        });
        Queue::after(function (JobProcessed $event): void {
            Log::info('queue_job_finished', ['job_id' => $event->job->getJobId(), 'job_type' => $event->job->resolveName(), 'queue' => $event->job->getQueue()]);
        });
        Queue::exceptionOccurred(function (JobExceptionOccurred $event): void {
            Log::warning('queue_job_exception', ['job_id' => $event->job->getJobId(), 'job_type' => $event->job->resolveName(), 'exception_type' => $event->exception::class]);
        });
        Gate::define('staff.access', fn (User $user): bool => $user->isStaff() && MfaState::complete(request(), $user));
        foreach (PermissionMatrix::grants()['owner'] as $permission) {
            Gate::define($permission, fn (User $user): bool => MfaState::complete(request(), $user) && $user->hasPermission($permission)
                && (! in_array($permission, ['refunds.approve', 'refunds.submit', 'staff.provision', 'roles.assign', 'security.configure'], true) || MfaState::recent(request(), $user)));
        }

        foreach (['login' => 5, 'register' => 3, 'recovery' => 3, 'reset' => 5, 'mfa' => 5, 'mfa-enroll' => 5, 'reauth' => 5, 'staff' => 20] as $action => $limit) {
            RateLimiter::for('identity-'.$action, function (Request $request) use ($action, $limit): array {
                $email = is_string($request->input('email')) ? strtolower(trim($request->input('email'))) : '';
                $digest = fn (string $value): string => hash_hmac('sha256', $value, (string) config('app.key'));

                return [
                    Limit::perMinute((int) config('limits.identity.'.$action, $limit))->by($action.':account:'.$digest($request->user()?->getAuthIdentifier() ?? $email)),
                    Limit::perMinute((int) config('limits.identity.network', 30))->by($action.':network:'.$digest($request->ip() ?? 'unknown')),
                ];
            });
        }

        RateLimiter::for('checkout', function (Request $r): array {
            $digest = fn (string $v): string => hash_hmac('sha256', $v, (string) config('app.key'));

            return [Limit::perMinute((int) config('limits.checkout.principal', 40))->by('checkout:principal:'.$digest((string) ($r->user()?->getAuthIdentifier() ?? $r->ip()))), Limit::perMinute((int) config('limits.checkout.network', 100))->by('checkout:network:'.$digest($r->ip() ?? 'unknown'))];
        });
        RateLimiter::for('payments', fn (Request $r): array => [Limit::perMinute((int) config('limits.payments.principal', 12))->by('payment:'.($r->user()?->getAuthIdentifier() ?? $r->ip())), Limit::perMinute((int) config('limits.payments.network', 40))->by('payment-ip:'.$r->ip())]);
        RateLimiter::for('orders', function (Request $r): array {
            $digest = fn (string $v): string => hash_hmac('sha256', $v, (string) config('app.key'));

            return [Limit::perMinute((int) config('limits.orders.principal', 40))->by('orders:principal:'.$digest((string) ($r->user()?->getAuthIdentifier() ?? $r->ip()))), Limit::perMinute((int) config('limits.orders.network', 100))->by('orders:network:'.$digest($r->ip() ?? 'unknown'))];
        });

        RateLimiter::for('cart', function (Request $r): array {
            $digest = fn (string $value): string => hash_hmac('sha256', $value, (string) config('app.key'));

            return [Limit::perMinute((int) config('limits.cart.principal', 60))->by('cart:principal:'.$digest((string) ($r->user()?->getAuthIdentifier() ?? $r->ip()))),
                Limit::perMinute((int) config('limits.cart.network', 120))->by('cart:network:'.$digest($r->ip() ?? 'unknown'))];
        });

        RateLimiter::for('catalog-public', function (Request $r): Limit {
            $key = (string) config('catalog.internal_read_key');
            $supplied = $r->header('X-Catalog-Renderer', '');
            $renderer = strlen($key) >= 32 && hash_equals($key, $supplied);

            return Limit::perMinute((int) config($renderer ? 'catalog.renderer_requests_per_minute' : 'catalog.public_requests_per_minute'))
                ->by(($renderer ? 'catalog-renderer:' : 'catalog:').$r->ip());
        });
        RateLimiter::for('catalog-admin', fn (Request $r) => Limit::perMinute((int) config('limits.admin', 120))->by('catalog-admin:'.$r->user()?->getAuthIdentifier()));

        if ($this->app->environment('production')) {
            $debug = (bool) config('app.debug');
            config(['app.debug' => false]);
            if (strlen((string) config('catalog.internal_read_key')) < 32) {
                throw new \LogicException('Production catalog needs a shared private renderer key.');
            }
            if (config('catalog.disk') !== 's3' || ! ProductionConfiguration::secureOrigin((string) config('catalog.public_origin'))) {
                throw new \LogicException('Production catalog requires private S3 storage and an HTTPS owned media origin.');
            }
            /** @var array<int, string> $origins */
            $origins = config('cors.allowed_origins', []);
            if (config('session.driver') !== 'database' || config('session.encrypt') !== true || config('session.domain') !== null || config('session.http_only') !== true || config('session.same_site') !== 'lax') {
                throw new \LogicException('Production identity requires encrypted PostgreSQL sessions and host-only cookies.');
            }
            if (config('database.default') !== 'pgsql' || config('database.connections.pgsql.sslmode') !== 'verify-full') {
                throw new \LogicException('Production requires PostgreSQL with verified TLS.');
            }
            if (config('queue.default') !== 'redis' || config('cache.default') !== 'redis') {
                throw new \LogicException('Production requires the configured Redis queue and cache.');
            }
            if (config('database.redis.default.scheme') !== 'tls' || config('database.redis.cache.scheme') !== 'tls') {
                throw new \LogicException('Production Redis connections require verified TLS.');
            }
            if ((int) config('queue.connections.redis.retry_after') <= 60) {
                throw new \LogicException('Queue retry lease must exceed the maximum job timeout.');
            }
            if (! ProductionConfiguration::secureOrigin((string) config('payments.return_origin'))) {
                throw new \LogicException('Production frontend origin must use HTTPS.');
            }
            ProductionConfiguration::validate(
                $debug,
                (bool) config('session.secure'),
                (string) config('app.url'),
                $origins,
            );
        }
    }
}
