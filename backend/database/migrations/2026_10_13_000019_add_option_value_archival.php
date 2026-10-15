<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE option_values ADD COLUMN archived_at timestamptz NULL');
        DB::statement('CREATE INDEX option_values_active_idx ON option_values(option_id, position) WHERE archived_at IS NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX option_values_active_idx');
        DB::statement('ALTER TABLE option_values DROP COLUMN archived_at');
    }
};
