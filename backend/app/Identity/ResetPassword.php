<?php

namespace App\Identity;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

final class ResetPassword
{
    /** @param array{email: string, token: string, password: string} $data */
    public function execute(#[\SensitiveParameter] array $data): bool
    {
        return DB::transaction(function () use ($data): bool {
            $user = User::where('email', $data['email'])->lockForUpdate()->first();
            if (! $user || $user->status !== 'active') {
                return false;
            }
            $repository = Password::broker()->getRepository();
            if (! $repository->exists($user, $data['token'])) {
                return false;
            }
            $user->password = $data['password'];
            $user->auth_version++;
            $user->save();
            $repository->delete($user);
            DB::table('sessions')->where('user_id', $user->id)->delete();
            SecurityEvents::record('identity.password_reset', $user);

            return true;
        });
    }
}
