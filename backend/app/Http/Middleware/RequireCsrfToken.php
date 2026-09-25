<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;

final class RequireCsrfToken extends ValidateCsrfToken
{
    // The approved contract requires token verification even for same-origin writes.
    protected function hasValidOrigin($request): bool
    {
        return false;
    }

    protected function runningUnitTests(): bool
    {
        return false;
    }
}
