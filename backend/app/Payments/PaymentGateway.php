<?php

namespace App\Payments;

interface PaymentGateway
{
    public function provider(): string;

    public function ready(): bool;

    public function initializePayment(string $reference, string $amount, string $currency, string $email, string $callback, string $method): ?string;

    public function verifyPayment(string $reference): Verification;

    public function refundsReady(): bool;

    public function refundPayment(string $transaction, string $amount, string $merchantReference): RefundVerification;

    public function verifyRefund(string $providerId): RefundVerification;

    public function validateWebhook(string $body, string $signature): bool;

    /** @return array{event:string,reference:?string,transaction_id:?string} */
    public function parseWebhook(string $body): array;
}
