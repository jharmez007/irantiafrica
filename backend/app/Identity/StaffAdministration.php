<?php

namespace App\Identity;

use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

final class StaffAdministration
{
    /**
     * @template T
     *
     * @param  callable(User): T  $action
     * @return T
     */
    private function authorized(Request $request, string $permission, callable $action): mixed
    {
        return DB::transaction(function () use ($request, $permission, $action) {
            DB::select('SELECT pg_advisory_xact_lock(310021)');
            $actor = User::whereKey($request->user()?->getAuthIdentifier())->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize($permission);
            MfaState::assertRecent($request, $actor);

            return $action($actor);
        });
    }

    public function provision(Request $request, string $name, string $email, string $roleCode): User
    {
        return $this->authorized($request, 'staff.provision', function (User $actor) use ($name, $email, $roleCode): User {
            $role = $this->role($roleCode);
            // No usable shared/default initial password. The recipient sets one using recovery.
            $user = User::create(['name' => $name, 'email' => $email, 'password' => bin2hex(random_bytes(32))])->refresh();
            $user->roles()->attach($role->id, ['id' => (string) Str::uuid(), 'granted_by' => $actor->id]);
            SecurityEvents::record('identity.staff_created', $actor, subject: $user->id);
            SecurityEvents::record('identity.role_assigned', $actor, subject: $user->id, changes: ['role' => $roleCode]);
            Password::broker()->sendResetLink(['email' => $user->email]);

            return $user;
        });
    }

    public function changeRole(Request $request, string $id, string $roleCode): void
    {
        $this->authorized($request, 'roles.assign', function (User $actor) use ($id, $roleCode): void {
            abort_if($actor->id === $id, 403);
            $target = User::whereKey($id)->lockForUpdate()->firstOrFail();
            $role = $this->role($roleCode);
            $before = $target->roles()->pluck('code')->all();
            $this->protectLastOwner($target, $roleCode === 'owner');
            $target->roles()->sync([$role->id => ['id' => (string) Str::uuid(), 'granted_by' => $actor->id]]);
            $this->revoke($target);
            SecurityEvents::record('identity.role_changed', $actor, subject: $target->id, changes: ['before' => $before, 'after' => [$roleCode]]);
        });
    }

    public function disable(Request $request, string $id): void
    {
        $this->authorized($request, 'staff.provision', function (User $actor) use ($id): void {
            abort_if($actor->id === $id, 403);
            $target = User::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($target->roles()->exists(), 404);
            $this->protectLastOwner($target, false);
            $target->status = 'disabled';
            $this->revoke($target);
            SecurityEvents::record('identity.staff_disabled', $actor, subject: $target->id);
        });
    }

    public function resetMfa(Request $request, string $id, string $reason): void
    {
        $this->authorized($request, 'security.configure', function (User $actor) use ($id, $reason): void {
            abort_if($actor->id === $id, 403);
            $target = User::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($target->roles()->exists(), 404);
            $target->mfa_secret_ciphertext = null;
            $target->mfa_confirmed_at = null;
            $target->mfa_recovery_hashes = null;
            $target->mfa_last_used_step = null;
            $this->revoke($target);
            SecurityEvents::record('identity.mfa_reset', $actor, subject: $target->id, changes: ['reason_code' => $reason]);
        });
    }

    public function bootstrap(string $name, string $email, string $password): User
    {
        return DB::transaction(function () use ($name, $email, $password): User {
            DB::select('SELECT pg_advisory_xact_lock(310021)');
            abort_if(DB::table('user_roles')->join('roles', 'roles.id', '=', 'user_roles.role_id')->where('roles.code', 'owner')->exists(), 409);
            $role = $this->role('owner');
            $user = User::create(['name' => $name, 'email' => $email, 'password' => $password])->refresh();
            $user->roles()->attach($role->id, ['id' => (string) Str::uuid(), 'granted_by' => null]);
            SecurityEvents::record('identity.owner_bootstrapped', subject: $user->id, actorType: 'service');
            SecurityEvents::record('identity.role_assigned', subject: $user->id, changes: ['role' => 'owner'], actorType: 'service');

            return $user;
        });
    }

    private function role(string $code): Role
    {
        abort_unless(array_key_exists($code, PermissionMatrix::grants()), 422);

        return Role::where('code', $code)->firstOrFail();
    }

    private function protectLastOwner(User $target, bool $retainsOwner): void
    {
        if ($retainsOwner || $target->status !== 'active' || ! $target->roles()->where('code', 'owner')->exists()) {
            return;
        }
        abort_unless(User::where('status', 'active')->whereHas('roles', fn ($query) => $query->where('code', 'owner'))->whereKeyNot($target->id)->exists(), 409);
    }

    private function revoke(User $target): void
    {
        $target->auth_version++;
        $target->save();
        DB::table('sessions')->where('user_id', $target->id)->delete();
        DB::table('password_reset_tokens')->where('email', $target->email)->delete();
    }
}
