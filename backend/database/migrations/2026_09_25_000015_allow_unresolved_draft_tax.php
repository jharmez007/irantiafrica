<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE products ALTER COLUMN tax_category_code DROP NOT NULL');
    }

    public function down(): void
    {
        // Fail rather than fabricate a tax treatment for existing incomplete drafts.
        DB::statement('ALTER TABLE products ALTER COLUMN tax_category_code SET NOT NULL');
    }
};
