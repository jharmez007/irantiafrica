<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_method_check');
        DB::statement("ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_method_check CHECK(method IN ('card','bank_transfer','hosted'))");
    }

    public function down(): void
    {
        if (DB::table('payment_attempts')->where('method', 'hosted')->exists()) {
            throw new LogicException('Hosted payment attempts are retained. Rollback requires an explicit data migration.');
        }
        DB::statement('ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_method_check');
        DB::statement("ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_method_check CHECK(method IN ('card','bank_transfer'))");
    }
};
