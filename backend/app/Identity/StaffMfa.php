<?php

namespace App\Identity;

use App\Models\User;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use PragmaRX\Google2FA\Google2FA;

final class StaffMfa
{
    /**
     * @template T
     *
     * @param  callable(User): T  $action
     * @return T
     */
    public function locked(Request $request, callable $action): mixed
    {
        return DB::transaction(function () use ($request, $action) {
            $user = User::whereKey($request->user()?->getAuthIdentifier())->lockForUpdate()->firstOrFail();
            abort_unless($user->isStaff() && $user->auth_version === $request->session()->get('auth_version'), 403);

            return $action($user);
        });
    }

    /** @return array{secret: string, qr: string} */
    public function enroll(Request $request): array
    {
        return $this->locked($request, function (User $user) use ($request): array {
            abort_if($user->mfa_confirmed_at !== null, 409);
            $totp = new Google2FA;
            $secret = $totp->generateSecretKey(32);
            $request->session()->put(['pending_mfa_secret' => $secret, 'pending_mfa_at' => time()]);
            $url = $totp->getQRCodeUrl('IRANTI Africa', $user->email, $secret);
            $svg = (new Writer(new ImageRenderer(new RendererStyle(240), new SvgImageBackEnd)))->writeString($url);
            SecurityEvents::record('identity.mfa_enrollment_started', $user);

            return ['secret' => $secret, 'qr' => 'data:image/svg+xml;base64,'.base64_encode($svg)];
        });
    }

    /** @return list<string> */
    public function confirm(Request $request, string $code): array
    {
        $result = $this->locked($request, function (User $user) use ($request, $code): ?array {
            abort_if($user->mfa_confirmed_at !== null, 409);
            $secret = $request->session()->get('pending_mfa_secret');
            abort_unless(is_string($secret) && time() - (int) $request->session()->get('pending_mfa_at', 0) <= 600, 409);
            $step = (new Google2FA)->verifyKeyNewer($secret, $code, 0, 1);
            if (! is_int($step)) {
                SecurityEvents::record('identity.mfa_failed', $user, 'denied');

                return null;
            }
            $user->mfa_secret_ciphertext = Crypt::encryptString($secret);
            $user->mfa_confirmed_at = now();
            $user->mfa_last_used_step = $step;
            $codes = $this->replaceCodes($user);
            $user->auth_version++;
            $user->save();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            $request->session()->put('auth_version', $user->auth_version);
            MfaState::establish($request, $user);
            SecurityEvents::record('identity.mfa_enabled', $user);

            return $codes;
        });
        if ($result === null) {
            $this->invalid();
        }

        return $result;
    }

    public function challenge(Request $request, string $code, bool $recovery = false): void
    {
        $accepted = $this->locked($request, function (User $user) use ($request, $code, $recovery): bool {
            abort_unless($user->mfa_confirmed_at !== null, 409);
            abort_if(MfaState::complete($request, $user), 409);
            if (! $this->consume($user, $code, $recovery)) {
                SecurityEvents::record('identity.mfa_failed', $user, 'denied');

                return false;
            }
            $user->save();
            MfaState::establish($request, $user);
            SecurityEvents::record($recovery ? 'identity.recovery_code_used' : 'identity.mfa_challenge', $user);

            return true;
        });
        if (! $accepted) {
            $this->invalid();
        }
    }

    public function reauthenticate(Request $request, string $password, string $code): void
    {
        $accepted = $this->locked($request, function (User $user) use ($request, $password, $code): bool {
            abort_unless(MfaState::complete($request, $user), 403);
            if (! Hash::check($password, $user->password) || ! $this->consume($user, $code, false)) {
                SecurityEvents::record('identity.reauthentication_failed', $user, 'denied');

                return false;
            }
            $user->save();
            MfaState::establish($request, $user);
            $request->session()->put('recent_auth_at', time());
            SecurityEvents::record('identity.reauthenticated', $user);

            return true;
        });
        if (! $accepted) {
            $this->invalid();
        }
    }

    /** @return list<string> */
    public function regenerate(Request $request, string $password, string $code): array
    {
        $codes = $this->locked($request, function (User $user) use ($request, $password, $code): ?array {
            abort_unless(MfaState::complete($request, $user), 403);
            if (! Hash::check($password, $user->password) || ! $this->consume($user, $code, false)) {
                SecurityEvents::record('identity.mfa_failed', $user, 'denied');

                return null;
            }
            $codes = $this->replaceCodes($user);
            $user->save();
            MfaState::establish($request, $user);
            $request->session()->put('recent_auth_at', time());
            SecurityEvents::record('identity.recovery_codes_regenerated', $user);

            return $codes;
        });
        if ($codes === null) {
            $this->invalid();
        }

        return $codes;
    }

    private function consume(User $user, string $code, bool $recovery): bool
    {
        if ($recovery) {
            $hashes = $user->mfa_recovery_hashes ?? [];
            foreach ($hashes as $index => $hash) {
                if (Hash::check($code, $hash)) {
                    unset($hashes[$index]);
                    $user->mfa_recovery_hashes = array_values($hashes);

                    return true;
                }
            }

            return false;
        }
        if (! is_string($user->mfa_secret_ciphertext)) {
            return false;
        }
        $step = (new Google2FA)->verifyKeyNewer(Crypt::decryptString($user->mfa_secret_ciphertext), $code, $user->mfa_last_used_step ?? 0, 1);
        if (! is_int($step)) {
            return false;
        }
        $user->mfa_last_used_step = $step;

        return true;
    }

    /** @return list<string> */
    private function replaceCodes(User $user): array
    {
        $codes = [];
        $hashes = [];
        for ($i = 0; $i < 8; $i++) {
            $code = bin2hex(random_bytes(16));
            $codes[] = $code;
            $hashes[] = Hash::make($code);
        }
        $user->mfa_recovery_hashes = $hashes;

        return $codes;
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['code' => ['The authentication code is invalid or has already been used.']]);
    }
}
