<?php

namespace App\Payments;

use Illuminate\Support\Facades\Http;

final class PaystackGateway implements PaymentGateway
{
    public function provider(): string
    {
        return 'paystack';
    }

    public function ready(): bool
    {
        $mode = config('payments.mode');
        $key = (string) config('payments.secret_key');
        $origin = (string) config('payments.return_origin');
        $url = parse_url($origin);
        $validOrigin = is_array($url) && isset($url['host']) && ! isset($url['user']) && ! isset($url['pass']) && ! isset($url['query']) && ! isset($url['fragment']) && in_array($url['path'] ?? '', ['', '/'], true);
        $secure = ($url['scheme'] ?? '') === 'https';
        $local = app()->environment(['local', 'testing']) && ($url['scheme'] ?? '') === 'http' && in_array($url['host'] ?? '', ['localhost', '127.0.0.1'], true);

        return config('payments.enabled') === true && $validOrigin && ($secure || $local) && in_array($mode, ['test', 'live'], true)
            && preg_match('/^sk_'.preg_quote((string) $mode, '/').'_[a-zA-Z0-9]{16,}$/D', $key) === 1
            && ($mode === 'test' ? ! app()->environment('production') : (app()->environment('production') && config('payments.live_approved') === true));
    }

    public function initializePayment(string $reference, string $amount, string $currency, string $email, string $callback, string $method): ?string
    {
        if (! $this->ready()) {
            return null;
        }
        try {
            $r = Http::withToken((string) config('payments.secret_key'))->acceptJson()->connectTimeout(3)->timeout(12)->withoutRedirecting()
                ->post('https://api.paystack.co/transaction/initialize', ['reference' => $reference, 'amount' => $amount, 'currency' => $currency, 'email' => $email, 'callback_url' => $callback, 'channels' => [$method], 'metadata' => json_encode(['payment_reference' => $reference], JSON_THROW_ON_ERROR)]);
            $j = json_decode($r->body(), true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
            $url = $j['data']['authorization_url'] ?? null;
            if (! $r->successful() || ($j['status'] ?? null) !== true || ($j['data']['reference'] ?? null) !== $reference || ! is_string($url)) {
                return null;
            }
            $p = parse_url($url);

            return ($p['scheme'] ?? '') === 'https' && ($p['host'] ?? '') === 'checkout.paystack.com' && ! isset($p['user']) && ! isset($p['pass']) && ! isset($p['port']) ? $url : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public function verifyPayment(string $reference): Verification
    {
        if (! $this->ready()) {
            return new Verification('UNKNOWN', $reference);
        }
        try {
            $r = Http::withToken((string) config('payments.secret_key'))->acceptJson()->connectTimeout(3)->timeout(12)->withoutRedirecting()->get('https://api.paystack.co/transaction/verify/'.rawurlencode($reference));
            if ($r->status() === 429) {
                $delay = $r->header('Retry-After');

                return new Verification('UNKNOWN', $reference, retryAfter: ctype_digit($delay) ? min(3600, (int) $delay) : 60);
            }
            $j = json_decode($r->body(), true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
            if (! $r->successful() || ($j['status'] ?? null) !== true || ! is_array($j['data'] ?? null)) {
                return new Verification('UNKNOWN', $reference);
            }
            $d = $j['data'];
            $ref = $d['reference'] ?? null;
            $amount = $d['amount'] ?? null;
            $id = $d['id'] ?? null;
            if (! is_string($ref) || strlen($ref) > 120 || ! (is_int($amount) || is_string($amount)) || ! preg_match('/^(0|[1-9][0-9]{0,17})$/D', (string) $amount)
                || ! (is_int($id) || is_string($id)) || ! preg_match('/^[1-9][0-9]{0,19}$/D', (string) $id) || ! is_string($d['currency'] ?? null) || ! preg_match('/^[A-Z]{3}$/D', $d['currency'])
                || ! is_string($d['channel'] ?? null) || ! preg_match('/^[a-z_]{1,32}$/D', $d['channel']) || ! in_array($d['domain'] ?? null, ['test', 'live'], true)) {
                return new Verification('UNKNOWN', $reference);
            }
            $state = match ($d['status'] ?? null) {
                'success' => 'SUCCEEDED','failed' => 'FAILED','abandoned' => 'ABANDONED','pending','ongoing','processing','queued' => 'PENDING','reversed' => 'REQUIRES_REVIEW',default => 'UNKNOWN'
            };

            return new Verification($state, $ref, (string) $id, (string) $amount, $d['currency'], $d['channel'], $d['domain']);
        } catch (\Throwable) {
            return new Verification('UNKNOWN', $reference);
        }
    }

    public function refundsReady(): bool
    {
        return $this->ready() && config('refunds.enabled') === true
            && (config('payments.mode') !== 'live' || config('refunds.live_approved') === true);
    }

    public function refundPayment(string $transaction, string $amount, string $merchantReference): RefundVerification
    {
        if (! $this->refundsReady()) {
            return new RefundVerification('UNKNOWN');
        }
        try {
            // Paystack does not document a refund idempotency-key guarantee. Never retry this POST.
            $r = Http::withToken((string) config('payments.secret_key'))->acceptJson()->connectTimeout(3)->timeout(12)->withoutRedirecting()
                ->post('https://api.paystack.co/refund', ['transaction' => $transaction, 'amount' => $amount, 'currency' => 'NGN', 'merchant_note' => $merchantReference]);

            return $this->refundResponse($r->successful(), $r->body());
        } catch (\Throwable) {
            return new RefundVerification('UNKNOWN');
        }
    }

    public function verifyRefund(string $providerId): RefundVerification
    {
        if (! $this->refundsReady() || ! preg_match('/^[1-9][0-9]{0,19}$/D', $providerId)) {
            return new RefundVerification('UNKNOWN');
        }
        try {
            $r = Http::withToken((string) config('payments.secret_key'))->acceptJson()->connectTimeout(3)->timeout(12)->withoutRedirecting()->get('https://api.paystack.co/refund/'.$providerId);

            return $this->refundResponse($r->successful(), $r->body());
        } catch (\Throwable) {
            return new RefundVerification('UNKNOWN');
        }
    }

    private function refundResponse(bool $ok, string $body): RefundVerification
    {
        $j = json_decode($body, true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        $d = $j['data'] ?? null;
        if (! $ok || ($j['status'] ?? null) !== true || ! is_array($d)) {
            return new RefundVerification('UNKNOWN');
        }
        $transaction = $d['transaction'] ?? null;
        $tx = is_array($transaction) ? ($transaction['id'] ?? null) : $transaction;
        $mode = $d['domain'] ?? (is_array($transaction) ? ($transaction['domain'] ?? null) : null);
        $id = $d['id'] ?? null;
        $amount = $d['amount'] ?? null;
        $note = $d['merchant_note'] ?? null;
        foreach ([$id, $tx] as $value) {
            if (! (is_int($value) || is_string($value)) || ! preg_match('/^[1-9][0-9]{0,19}$/D', (string) $value)) {
                return new RefundVerification('UNKNOWN');
            }
        }
        if (! (is_int($amount) || is_string($amount)) || ! preg_match('/^[1-9][0-9]{0,17}$/D', (string) $amount) || ($d['currency'] ?? null) !== 'NGN' || ! in_array($mode, ['test', 'live'], true) || ! is_string($note) || strlen($note) > 120) {
            return new RefundVerification('UNKNOWN');
        }
        $state = match ($d['status'] ?? null) {
            'processed' => 'SUCCEEDED', 'failed' => 'FAILED', 'pending','processing' => 'PENDING', default => 'UNKNOWN'
        };

        return new RefundVerification($state, (string) $id, (string) $tx, (string) $amount, 'NGN', $note, $mode);
    }

    public function validateWebhook(string $body, string $signature): bool
    {
        return $this->ready() && preg_match('/^[0-9a-f]{128}$/D', $signature) === 1 && hash_equals(hash_hmac('sha512', $body, (string) config('payments.secret_key')), $signature);
    }

    public function parseWebhook(string $body): array
    {
        $d = json_decode($body, true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        $event = $d['event'] ?? '';
        if (! is_string($event) || ! preg_match('/^[a-z_.-]{1,64}$/D', $event)) {
            throw new \UnexpectedValueException('Invalid event');
        }
        $ref = str_starts_with($event, 'refund.') ? ($d['data']['transaction_reference'] ?? null) : ($d['data']['reference'] ?? null);
        $id = $d['data']['id'] ?? null;

        return ['event' => $event, 'reference' => is_string($ref) && preg_match('/^[a-zA-Z0-9.=-]{1,120}$/D', $ref) ? $ref : null, 'transaction_id' => (is_string($id) || is_int($id)) && preg_match('/^[1-9][0-9]{0,19}$/D', (string) $id) ? (string) $id : null];
    }
}
