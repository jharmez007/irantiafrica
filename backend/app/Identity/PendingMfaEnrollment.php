<?php

namespace App\Identity;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

/** Short-lived, encrypted enrollment secret outside the server session. */
final class PendingMfaEnrollment
{
    public static function put(Request $request, User $user, string $secret): void
    {
        Cache::store()->put(self::key($request, $user), Crypt::encryptString($secret), 600);
        $request->session()->forget('pending_mfa_secret');
        $request->session()->put('pending_mfa_at', time());
    }

    public static function get(Request $request, User $user): ?string
    {
        $request->session()->forget('pending_mfa_secret');
        if (time() - (int) $request->session()->get('pending_mfa_at', 0) > 600) {
            return null;
        }
        $ciphertext = Cache::store()->get(self::key($request, $user));

        return is_string($ciphertext) ? Crypt::decryptString($ciphertext) : null;
    }

    public static function forget(Request $request, User $user): void
    {
        Cache::store()->forget(self::key($request, $user));
        $request->session()->forget(['pending_mfa_secret', 'pending_mfa_at']);
    }

    private static function key(Request $request, User $user): string
    {
        return 'identity:mfa-enrollment:'.hash('sha256', $user->id.':'.$request->session()->getId());
    }
}
