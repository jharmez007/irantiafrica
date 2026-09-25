<?php

namespace App\Console\Commands;

use App\Identity\StaffAdministration;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

final class BootstrapOwner extends Command
{
    protected $signature = 'identity:bootstrap-owner';

    protected $description = 'One-time audited owner creation; hidden password entry, MFA required before staff access';

    public function handle(StaffAdministration $staff): int
    {
        if (! $this->input->isInteractive()) {
            $this->error('Interactive, hidden password entry is required.');

            return self::FAILURE;
        }
        $data = ['name' => $this->ask('Owner name'), 'email' => strtolower(trim((string) $this->ask('Owner email'))),
            'password' => $this->secret('Initial password (12–72 UTF-8 bytes)'), 'password_confirmation' => $this->secret('Confirm password')];
        $validated = Validator::make($data, ['name' => ['required', 'string', 'max:160'], 'email' => ['required', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', Password::min(12), 'max:72', 'confirmed', function (string $attribute, mixed $value, \Closure $fail): void {
                if (is_string($value) && strlen($value) > 72) {
                    $fail('Password exceeds 72 UTF-8 bytes.');
                }
            }]])->validate();
        $staff->bootstrap($validated['name'], $validated['email'], $validated['password']);
        $this->info('Owner created. Sign in and confirm MFA enrollment before accessing staff functions.');

        return self::SUCCESS;
    }
}
