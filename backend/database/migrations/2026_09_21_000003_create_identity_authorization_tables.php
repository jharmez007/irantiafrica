<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('code', 64)->unique();
            $table->string('name', 120);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
        Schema::create('permissions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('code', 100)->unique();
            $table->text('description');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
        Schema::create('user_roles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete()->restrictOnUpdate();
            $table->foreignUuid('role_id')->constrained()->restrictOnDelete()->restrictOnUpdate();
            $table->foreignUuid('granted_by')->nullable()->constrained('users')->nullOnDelete()->restrictOnUpdate();
            $table->unique(['user_id', 'role_id']);
            $table->index('role_id');
            $table->index('granted_by');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
        Schema::create('role_permissions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('role_id')->constrained()->cascadeOnDelete()->restrictOnUpdate();
            $table->foreignUuid('permission_id')->constrained()->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['role_id', 'permission_id']);
            $table->index('permission_id');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('actor_user_id')->nullable()->constrained('users')->restrictOnDelete()->restrictOnUpdate();
            $table->string('actor_type', 24);
            $table->string('actor_reference', 120)->nullable();
            $table->string('action', 120);
            $table->string('subject_type', 80);
            $table->uuid('subject_id')->nullable();
            $table->string('outcome', 24);
            $table->text('reason')->nullable();
            $table->jsonb('changes')->default('{}');
            $table->string('request_id', 100)->index();
            $table->timestampTz('occurred_at')->useCurrent();
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['subject_type', 'subject_id', 'occurred_at']);
            $table->index(['actor_user_id', 'occurred_at']);
            $table->index(['action', 'occurred_at']);
        });
        DB::statement("ALTER TABLE audit_logs ADD CONSTRAINT audit_actor_check CHECK (actor_type IN ('user','guest','service','anonymous')), ADD CONSTRAINT audit_changes_check CHECK (jsonb_typeof(changes) = 'object')");
        DB::unprepared("CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit records are append-only'; END; $$");
        DB::unprepared('CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation()');
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        DB::statement('DROP FUNCTION IF EXISTS reject_audit_mutation()');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('user_roles');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};
