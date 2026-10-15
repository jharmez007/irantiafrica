<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE option_values ADD COLUMN swatch_hex varchar(7) NULL CHECK (swatch_hex IS NULL OR swatch_hex ~ '^#[0-9A-F]{6}$')");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE option_values DROP COLUMN swatch_hex');
    }
};
