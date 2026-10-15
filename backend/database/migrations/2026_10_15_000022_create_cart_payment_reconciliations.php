<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
CREATE TABLE cart_payment_reconciliations (
 order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 source_cart_id uuid NOT NULL,
 removed_lines integer NOT NULL CHECK(removed_lines >= 0),
 preserved_lines integer NOT NULL CHECK(preserved_lines >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
)
SQL);
    }

    public function down(): void
    {
        if (DB::table('cart_payment_reconciliations')->exists()) {
            throw new LogicException('Paid-cart reconciliation records must not be discarded.');
        }

        DB::statement('DROP TABLE cart_payment_reconciliations');
    }
};
