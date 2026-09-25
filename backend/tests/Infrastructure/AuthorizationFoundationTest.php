<?php

namespace Tests\Infrastructure;

use App\Identity\SecurityEvents;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityRolesSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AuthorizationFoundationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->seed(IdentityRolesSeeder::class);
    }

    public function test_roles_are_uuid_and_idempotently_seeded_without_unapproved_grants(): void
    {
        $this->seed(IdentityRolesSeeder::class);
        $this->assertSame(['inventory_store', 'order_processing', 'owner'], Role::orderBy('code')->pluck('code')->all());
        foreach (Role::all() as $role) {
            $this->assertTrue(Str::isUuid($role->id));
        }
        $this->assertSame(0, Permission::count());
        $this->assertSame(0, User::count());
    }

    public function test_explicit_grants_only_and_no_owner_bypass_or_stale_permission_cache(): void
    {
        $permission = Permission::create(['code' => 'audit.read', 'description' => 'Test-only explicit grant; no production seed.']);
        $customer = User::factory()->create();
        $this->assertFalse(Gate::forUser($customer)->allows('staff.access'));
        $this->assertFalse(Gate::forUser($customer)->allows('audit.read'));
        foreach (Role::all() as $role) {
            $staff = User::factory()->create()->refresh();
            $staff->roles()->attach($role->id, ['id' => (string) Str::uuid()]);
            $this->assertTrue($staff->isStaff());
            $this->assertFalse($staff->hasPermission('audit.read'));
            $role->permissions()->attach($permission->id, ['id' => (string) Str::uuid()]);
            $this->assertTrue($staff->hasPermission('audit.read'));
            $this->assertFalse($staff->hasPermission('roles.assign'));
            $role->permissions()->detach($permission->id);
            $this->assertFalse($staff->hasPermission('audit.read'));
            $staff->status = 'disabled';
            $staff->save();
            $this->assertFalse($staff->isStaff());
        }
    }

    public function test_assignment_constraints_and_delete_policies(): void
    {
        $actor = User::factory()->create();
        $user = User::factory()->create();
        $role = Role::where('code', 'owner')->firstOrFail();
        $permission = Permission::create(['code' => 'fixture.permission', 'description' => 'Test fixture only']);
        $user->roles()->attach($role->id, ['id' => (string) Str::uuid(), 'granted_by' => $actor->id]);
        $role->permissions()->attach($permission->id, ['id' => (string) Str::uuid()]);
        foreach ([
            fn () => $user->roles()->attach($role->id, ['id' => (string) Str::uuid()]),
            fn () => $user->roles()->attach((string) Str::uuid(), ['id' => (string) Str::uuid()]),
            fn () => $role->permissions()->attach($permission->id, ['id' => (string) Str::uuid()]),
            fn () => $permission->delete(),
            fn () => $role->delete(),
        ] as $operation) {
            try {
                $operation();
                $this->fail('Expected FK/unique rejection.');
            } catch (QueryException) {
                $this->addToAssertionCount(1);
            }
        }
        $actor->delete();
        $this->assertNull(DB::table('user_roles')->where('user_id', $user->id)->value('granted_by'));
        $user->delete();
        $this->assertSame(0, DB::table('user_roles')->count());
        $role->delete();
        $this->assertSame(0, DB::table('role_permissions')->count());
        $this->assertTrue($permission->fresh()->exists);
    }

    public function test_audit_is_append_only_and_restricts_actor_deletion(): void
    {
        $user = User::factory()->create();
        SecurityEvents::record('identity.test', $user);
        foreach ([fn () => DB::table('audit_logs')->update(['outcome' => 'changed']), fn () => DB::table('audit_logs')->delete(), fn () => DB::statement('TRUNCATE audit_logs'), fn () => $user->delete()] as $operation) {
            try {
                $operation();
                $this->fail('Expected database rejection.');
            } catch (QueryException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertSame(1, DB::table('audit_logs')->count());
    }
}
