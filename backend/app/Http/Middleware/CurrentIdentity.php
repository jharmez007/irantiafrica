<?php

namespace App\Http\Middleware;

use App\Identity\MfaState;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

final class CurrentIdentity
{
    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $staff = $user->isStaff();
        $absoluteSeconds = (int) config($staff ? 'identity.staff_absolute_seconds' : 'identity.absolute_seconds');
        if ($user->status !== 'active' || $request->session()->get('auth_version') !== $user->auth_version
            || time() - (int) $request->session()->get('authenticated_at', 0) >= $absoluteSeconds) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            abort(401);
        }

        if ($staff) {
            $complete = MfaState::complete($request, $user);
            $expired = $complete
                ? time() - (int) $request->session()->get('staff_activity_at', 0) >= (int) config('identity.staff_idle_seconds')
                : $request->session()->has('mfa_user_id') || time() - (int) $request->session()->get('authenticated_at', 0) >= (int) config('identity.staff_pending_seconds');
            if ($expired) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
                abort(401);
            }
            if (! $complete && ! $request->is('api/v1/auth/me', 'api/v1/auth/logout', 'api/v1/auth/mfa/*')) {
                abort(403);
            }
            if ($complete) {
                $request->session()->put('staff_activity_at', time());
            }
        }

        return $next($request);
    }
}
