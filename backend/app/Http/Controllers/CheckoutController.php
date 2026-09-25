<?php

namespace App\Http\Controllers;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Checkout\CheckoutService;
use App\Checkout\NigeriaAddress;
use App\Models\CheckoutSession;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class CheckoutController
{
    public function __construct(private CheckoutService $checkout, private CheckoutConfiguration $configuration) {}

    private function user(Request $r): ?User
    {
        $u = $r->user();

        return $u instanceof User ? $u : null;
    }

    private function token(Request $r): ?string
    {
        $t = $r->cookie('iranti_checkout');

        return is_string($t) ? $t : null;
    }

    /** @param list<string> $keys */
    private function only(Request $r, array $keys): void
    {
        if (array_diff(array_keys($r->all()), $keys)) {
            throw ValidationException::withMessages(['request' => 'Unknown input field.']);
        }
    }

    private function key(Request $r): string
    {
        $key = $r->header('Idempotency-Key');
        if (! is_string($key) || ! Str::isUuid($key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'Supply a UUID Idempotency-Key.']);
        }

        return strtolower($key);
    }

    /** @return array<string,mixed> */
    private function version(Request $r): array
    {
        return $r->validate(['expected_version' => ['required', function ($a, $v, $f) {
            if (! is_int($v) || $v < 1 || $v > 2147483647) {
                $f('Use a positive JSON integer version.');
            }
        }]]);
    }

    private function response(CheckoutSession $s): JsonResponse
    {
        $token = $this->token(request());
        if ($s->user_id === null && $token !== null && hash_equals($s->guest_token_hash ?? '', hash('sha256', $token))) {
            $minutes = max(1, (int) ceil((CheckoutConfiguration::now()->diffInSeconds($s->expires_at, false) + 300) / 60));
            Cookie::queue(Cookie::make('iranti_checkout', $token, $minutes, '/', null, (bool) config('session.secure'), true, false, 'lax'));
        }

        return response()->json(['data' => $this->checkout->projection($s)]);
    }

    public function begin(Request $r): JsonResponse
    {
        $this->only($r, ['expected_version']);
        $v = $this->version($r);
        $cart = $r->cookie('iranti_cart');
        $result = $this->checkout->begin($this->user($r), is_string($cart) ? $cart : null, $this->token($r), $v['expected_version'], $this->key($r));
        if ($result['token']) {
            Cookie::queue(Cookie::make('iranti_checkout', $result['token'], (int) ceil((int) config('inventory.reservation_ttl_seconds') / 60) + 5, '/', null, (bool) config('session.secure'), true, false, 'lax'));
        }

        if ($result['token'] === null) {
            Cookie::queue(Cookie::forget('iranti_checkout', '/', null));
        }

        return $this->response($result['checkout']);
    }

    public function current(Request $r): JsonResponse
    {
        $this->only($r, []);
        $u = $this->user($r);
        $t = $this->token($r);
        $s = null;
        if ($t) {
            $s = CheckoutSession::whereNull('user_id')->where('guest_token_hash', hash('sha256', $t))->where('expires_at', '>', CheckoutConfiguration::now()->subMinutes(5))->first();
        }
        if (! $s && $u) {
            $s = CheckoutSession::where('user_id', $u->id)->latest()->first();
        }

        return $s ? $this->response($this->checkout->command($s->id, $u, $t, 'read')) : response()->json(['data' => null]);
    }

    public function show(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);

        return $this->response($this->checkout->command($id, $this->user($r), $this->token($r), 'read'));
    }

    public function address(Request $r, string $id): JsonResponse
    {
        $this->only($r, ['expected_version', 'email', 'address', 'saved_address_id']);
        $data = $this->version($r) + $r->validate(['email' => ['required', 'email:rfc', 'max:254'], 'address' => ['required_without:saved_address_id', 'prohibits:saved_address_id', 'array'], 'saved_address_id' => ['required_without:address', 'prohibits:address', 'uuid']]);

        return $this->response($this->checkout->command($id, $this->user($r), $this->token($r), 'address', $data));
    }

    public function validateCheckout(Request $r, string $id): JsonResponse
    {
        $this->only($r, ['expected_version']);

        return $this->response($this->checkout->command($id, $this->user($r), $this->token($r), 'validate', $this->version($r)));
    }

    public function reserve(Request $r, string $id): JsonResponse
    {
        $this->only($r, ['expected_version', 'fingerprint']);
        $data = $this->version($r) + $r->validate(['fingerprint' => ['required', 'string', 'regex:/^[0-9a-f]{64}$/D']]);

        return $this->response($this->checkout->command($id, $this->user($r), $this->token($r), 'reserve', $data, $this->key($r)));
    }

    public function cancel(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);

        return $this->response($this->checkout->command($id, $this->user($r), $this->token($r), 'cancel'));
    }

    public function destinations(): JsonResponse
    {
        $zones = DB::transaction(function (): array {
            CheckoutConfiguration::lock();
            try {
                return $this->configuration->current()['payload']['zones'];
            } catch (CheckoutConflict) {
                return [];
            }
        });

        return response()->json(['data' => ['states' => NigeriaAddress::states(), 'areas' => array_map(fn ($z) => ['state_code' => $z['state_code'], 'locality_code' => $z['locality_code']], $zones)]]);
    }

    public function publish(Request $r): JsonResponse
    {
        return response()->json(['data' => $this->configuration->publish($r->all(), $this->user($r) ?? abort(401))], 201);
    }

    public function addresses(Request $r): JsonResponse
    {
        $u = $this->user($r) ?? abort(401);

        return response()->json(['data' => DB::table('addresses')->where('user_id', $u->id)->orderBy('created_at')->get()->map(function ($a) {
            $data = (array) $a;
            unset($data['user_id']);

            return $data;
        })]);
    }

    public function saveAddress(Request $r): JsonResponse
    {
        $u = $this->user($r) ?? abort(401);
        $data = NigeriaAddress::validate($r->all());
        $id = DB::transaction(function () use ($data, $u): string {
            User::where('id', $u->id)->lockForUpdate()->firstOrFail();
            // Bounded engineering protection, not a purchase policy.
            if (DB::table('addresses')->where('user_id', $u->id)->count() >= 100) {
                throw new CheckoutConflict('ADDRESS_LIMIT', 'Remove an unused saved address before adding another.');
            }
            $id = (string) Str::uuid();
            DB::table('addresses')->insert(['id' => $id, 'user_id' => $u->id] + $data);

            return $id;
        }, 3);

        return response()->json(['data' => ['id' => $id] + $data], 201);
    }

    public function deleteAddress(Request $r, string $id): JsonResponse
    {
        $this->only($r, []);
        $u = $this->user($r) ?? abort(401);
        $n = DB::table('addresses')->where('id', $id)->where('user_id', $u->id)->delete();
        abort_unless($n > 0, 404);

        return response()->json(['data' => ['deleted' => true]]);
    }
}
