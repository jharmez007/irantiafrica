<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE products
 ADD COLUMN removed_at timestamptz,
 ADD COLUMN removed_by_user_id uuid REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT products_removal_actor_check CHECK((removed_at IS NULL) = (removed_by_user_id IS NULL));
CREATE INDEX products_removed_idx ON products(removed_at DESC, id) WHERE removed_at IS NOT NULL;
SQL);
    }

    public function down(): void
    {
        if (DB::table('products')->whereNotNull('removed_at')->exists()) {
            throw new LogicException('Removed products must be restored or migrated explicitly before rolling back their lifecycle columns.');
        }
        DB::unprepared('DROP INDEX products_removed_idx; ALTER TABLE products DROP CONSTRAINT products_removal_actor_check, DROP COLUMN removed_by_user_id, DROP COLUMN removed_at');
    }
};
