<?php

namespace App\Identity;

use App\Models\User;
use Illuminate\Http\Request;

final class MfaState
{
    public static function complete(Request $request, User $user): bool
    {
        return $request->hasSession() && $user->status === 'active' && $user->mfa_confirmed_at !== null
            && $request->session()->get('mfa_user_id') === $user->id
            && $request->session()->get('auth_version') === $user->auth_version;
    }

    public static function recent(Request $request, User $user): bool
    {
        return self::complete($request, $user) && time() - (int) $request->session()->get('recent_auth_at', 0) <= 300;
    }

    public static function assertRecent(Request $request, User $user): void
    {
        abort_unless(self::recent($request, $user), 403);
    }

    public static function establish(Request $request, User $user): void
    {
        $request->session()->regenerate(true);
        $request->session()->forget(['pending_mfa_secret', 'pending_mfa_at']);
        $request->session()->put(['mfa_user_id' => $user->id, 'recent_auth_at' => min(time(), (int) $request->session()->get('authenticated_at', 0)), 'staff_activity_at' => time()]);
    }
}
