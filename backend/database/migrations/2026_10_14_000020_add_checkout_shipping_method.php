<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE checkout_sessions ADD COLUMN shipping_method_code varchar(64)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE checkout_sessions DROP COLUMN shipping_method_code');
    }
};
