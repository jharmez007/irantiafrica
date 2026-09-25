<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

final class IdentityRolesSeeder extends Seeder
{
    public function run(): void
    {
        // Names are confirmed. No unapproved permission grants or default users.
        foreach (['owner' => 'Business Owner / Super Admin', 'order_processing' => 'Order Processing Staff', 'inventory_store' => 'Inventory / Store Staff'] as $code => $name) {
            Role::firstOrCreate(['code' => $code], ['name' => $name]);
        }
    }
}
