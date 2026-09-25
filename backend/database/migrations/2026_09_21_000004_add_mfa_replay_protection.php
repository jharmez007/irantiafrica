<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->bigInteger('mfa_last_used_step')->nullable();
        });
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_mfa_step_check CHECK (mfa_last_used_step IS NULL OR mfa_last_used_step >= 0)');
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('mfa_last_used_step');
        });
    }
};
