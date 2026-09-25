<?php

namespace App\Http\Controllers;

use App\Cart\CartSession;
use App\Http\Resources\IdentityResource;
use App\Identity\ResetPassword;
use App\Identity\SecurityEvents;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticationController
{
    private function normalize(Request $request): void
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => strtolower(trim($request->string('email')->toString()))]);
        }
    }

    public function register(Request $request): Response
    {
        $this->normalize($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', PasswordRule::min(12), 'max:72', 'confirmed', function (string $attribute, mixed $value, \Closure $fail): void {
                if (is_string($value) && strlen($value) > 72) {
                    $fail('The password must not exceed 72 UTF-8 bytes.');
                }
            }],
            'roles' => ['prohibited'], 'role_id' => ['prohibited'], 'permissions' => ['prohibited'],
            'status' => ['prohibited'], 'is_admin' => ['prohibited'], 'is_staff' => ['prohibited'],
        ]);
        try {
            $user = DB::transaction(function () use ($data): User {
                $user = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
                SecurityEvents::record('identity.registered', $user);

                return $user->refresh();
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => ['Unable to register with these details. Try signing in or recovering your account.']]);
        }
        $this->startSession($request, $user);
        app(CartSession::class)->afterAuthentication($request, $user);

        return (new IdentityResource($user))->response()->setStatusCode(201);
    }

    public function login(Request $request): Response
    {
        $this->normalize($request);
        $data = $request->validate(['email' => ['required', 'string', 'email:rfc', 'max:254'], 'password' => ['required', 'string', 'max:1024']]);
        $user = (new Timebox)->call(function () use ($data): ?User {
            $user = User::where('email', $data['email'])->first();
            if (! $user || ! Hash::check($data['password'], $user->password) || $user->status !== 'active') {
                return null;
            }

            return $user;
        }, 300000);
        if (! $user) {
            SecurityEvents::record('identity.login_failed', outcome: 'denied');
            abort(401);
        }
        SecurityEvents::record('identity.login', $user);
        $this->startSession($request, $user);
        app(CartSession::class)->afterAuthentication($request, $user);

        return (new IdentityResource($user))->response();
    }

    private function startSession(Request $request, User $user): void
    {
        Auth::guard('web')->login($user, false);
        $request->session()->regenerate(true);
        $request->session()->forget(['mfa_user_id', 'recent_auth_at', 'pending_mfa_secret', 'pending_mfa_at', 'cart_merge_notice']);
        $request->session()->put(['auth_version' => $user->auth_version, 'authenticated_at' => time()]);
    }

    public function me(Request $request): IdentityResource
    {
        return new IdentityResource($request->user());
    }

    public function logout(Request $request): Response
    {
        $user = $request->user();
        SecurityEvents::record('identity.logout', $user instanceof User ? $user : null);
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function forgot(Request $request): JsonResponse
    {
        $this->normalize($request);
        $data = $request->validate(['email' => ['required', 'string', 'email:rfc', 'max:254']]);
        $mailer = (string) config('mail.default');
        abort_unless(in_array($mailer, ['smtp', 'array'], true) && (! app()->environment('production') || $mailer === 'smtp'), 503);
        (new Timebox)->call(function () use ($data): void {
            DB::transaction(function () use ($data): void {
                $user = User::where('email', $data['email'])->lockForUpdate()->first();
                if ($user && $user->status === 'active') {
                    Password::broker()->sendResetLink(['email' => $data['email']]);
                }
                SecurityEvents::record('identity.recovery_requested');
            });
        }, 300000);

        return response()->json(['data' => ['message' => 'If the account is eligible, password recovery instructions will be sent.']]);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->normalize($request);
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:254'], 'token' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', PasswordRule::min(12), 'max:72', 'confirmed', function (string $attribute, mixed $value, \Closure $fail): void {
                if (is_string($value) && strlen($value) > 72) {
                    $fail('The password must not exceed 72 UTF-8 bytes.');
                }
            }],
        ]);
        $success = app(ResetPassword::class)->execute(['email' => $data['email'], 'token' => $data['token'], 'password' => $data['password']]);
        if (! $success) {
            throw ValidationException::withMessages(['token' => ['The recovery link is invalid or expired.']]);
        }
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['data' => ['message' => 'Password changed. Please sign in.']]);
    }
}
