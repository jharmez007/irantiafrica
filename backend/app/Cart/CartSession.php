<?php

namespace App\Cart;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Log;

final class CartSession
{
    public function token(Request $request): ?string
    {
        $value = $request->cookie('iranti_cart');

        return is_string($value) ? $value : null;
    }

    public function user(Request $request): ?User
    {
        $user = $request->user();

        return $user instanceof User ? $user : null;
    }

    public function cookies(CartResult $result): void
    {
        if ($result->forgetGuest) {
            Cookie::queue(Cookie::forget('iranti_cart', '/', null));
        } elseif ($result->guestToken !== null) {
            // Sanctum's EncryptCookies protects this opaque capability in transit/storage.
            Cookie::queue(Cookie::make('iranti_cart', $result->guestToken, (int) config('cart.guest_retention_days') * 1440,
                '/', null, (bool) config('session.secure'), true, false, 'lax'));
        }
    }

    public function afterAuthentication(Request $request, User $user): void
    {
        // Staff cart access continues to require the approved MFA gate.
        if ($user->isStaff()) {
            return;
        }
        try {
            $result = app(CartService::class)->mergeGuestCart($user, $this->token($request));
            $this->cookies($result);
            if ($result->data['merge'] !== null) {
                $request->session()->put('cart_merge_notice', $result->data['merge']);
            }
        } catch (\Throwable $exception) {
            Log::warning('Cart merge deferred after authentication', ['exception_type' => $exception::class]);
            $request->session()->put('cart_merge_notice', ['status' => 'RETRY_REQUIRED', 'message' => 'Sign-in succeeded, but cart reconciliation could not finish. Your selections are preserved. Open your cart to retry.']);
        }
    }

    public function response(CartResult $result, Request $request): JsonResponse
    {
        $this->cookies($result);
        $data = $result->data;
        if ($data['merge'] !== null) {
            $request->session()->put('cart_merge_notice', $data['merge']);
        } elseif ($request->user() !== null) {
            $data['merge'] = $request->session()->get('cart_merge_notice');
        }

        return response()->json(['data' => $data]);
    }
}
