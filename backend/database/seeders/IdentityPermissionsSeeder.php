<?php

namespace Database\Seeders;

use App\Identity\PermissionMatrix;
use App\Identity\SecurityEvents;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class IdentityPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            DB::select('SELECT pg_advisory_xact_lock(310021)');
            $this->call(IdentityRolesSeeder::class);
            foreach (PermissionMatrix::grants() as $roleCode => $codes) {
                $role = Role::where('code', $roleCode)->firstOrFail();
                $before = $role->permissions()->pluck('code')->sort()->values()->all();
                $assignments = [];
                foreach ($codes as $code) {
                    $permission = Permission::firstOrCreate(['code' => $code], ['description' => 'Approved document 17 capability: '.$code]);
                    $assignments[$permission->id] = ['id' => DB::table('role_permissions')->where('role_id', $role->id)->where('permission_id', $permission->id)->value('id') ?? (string) Str::uuid()];
                }
                $role->permissions()->sync($assignments);
                $after = $role->permissions()->pluck('code')->sort()->values()->all();
                if ($before !== $after) {
                    SecurityEvents::record('identity.permissions_changed', subject: $role->id, changes: ['before' => $before, 'after' => $after], actorType: 'service');
                }
            }
        });
    }
}
