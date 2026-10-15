<?php

namespace App\Payments;

final readonly class Initialization
{
    public function __construct(
        public string $state,
        public ?string $authorizationUrl = null,
        public ?int $httpStatus = null,
    ) {
        if ($state === 'INITIALIZED' && $authorizationUrl === null) {
            throw new \InvalidArgumentException('An initialized payment requires an authorization URL.');
        }
    }
}
