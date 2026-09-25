<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name', 160);
            $table->string('email', 254)->unique();
            $table->timestampTz('email_verified_at')->nullable();
            $table->string('password');
            $table->string('status', 20)->default('active')->index();
            $table->integer('auth_version')->default(1);
            $table->text('mfa_secret_ciphertext')->nullable();
            $table->jsonb('mfa_recovery_hashes')->nullable();
            $table->timestampTz('mfa_confirmed_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'anonymized'))");
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_auth_version_check CHECK (auth_version > 0)');
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_email_normalized_check CHECK (email = lower(btrim(email)) AND length(email) > 0)');

        Schema::create('password_reset_tokens', function (Blueprint $table): void {
            $table->string('email', 254)->primary();
            $table->foreign('email')->references('email')->on('users')->cascadeOnDelete()->restrictOnUpdate();
            $table->string('token');
            $table->timestampTz('created_at')->useCurrent()->index();
        });

        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignUuid('user_id')->nullable()->constrained()->cascadeOnDelete()->restrictOnUpdate();
            $table->index('user_id');
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->text('payload');
            $table->bigInteger('last_activity')->index();
        });
        DB::statement('ALTER TABLE sessions ADD CONSTRAINT sessions_last_activity_check CHECK (last_activity >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
