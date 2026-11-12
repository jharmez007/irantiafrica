<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE products
 ADD COLUMN recycle_expires_at timestamptz,
 ADD COLUMN purge_status varchar(24),
 ADD COLUMN purge_block_code varchar(64),
 ADD COLUMN purge_block_reason varchar(500),
 ADD COLUMN purge_completed_at timestamptz;

-- Older removal records have intact catalogue data, but they did not receive a
-- recovery deadline. Keep them reviewable and restorable; never auto-expire them.
UPDATE products SET purge_status = 'legacy_review' WHERE removed_at IS NOT NULL;

ALTER TABLE products
 ADD CONSTRAINT products_purge_status_check CHECK(purge_status IS NULL OR purge_status IN ('recoverable','blocked','completed','legacy_review')),
 ADD CONSTRAINT products_recycle_state_check CHECK(
  (removed_at IS NULL AND recycle_expires_at IS NULL AND purge_status IS NULL AND purge_block_code IS NULL AND purge_block_reason IS NULL AND purge_completed_at IS NULL)
  OR
  (removed_at IS NOT NULL AND purge_status IS NOT NULL)
 ),
 ADD CONSTRAINT products_recycle_deadline_check CHECK(recycle_expires_at IS NULL OR recycle_expires_at > removed_at),
 ADD CONSTRAINT products_purge_completion_check CHECK((purge_status = 'completed') = (purge_completed_at IS NOT NULL)),
 ADD CONSTRAINT products_purge_block_check CHECK(
  (purge_status = 'blocked' AND purge_block_code IS NOT NULL AND purge_block_reason IS NOT NULL)
  OR
  (purge_status <> 'blocked' AND purge_block_code IS NULL AND purge_block_reason IS NULL)
 );

CREATE INDEX products_recycle_due_idx
 ON products(recycle_expires_at, id)
 WHERE removed_at IS NOT NULL AND purge_completed_at IS NULL AND recycle_expires_at IS NOT NULL;
CREATE INDEX products_recycle_state_idx
 ON products(purge_status, removed_at DESC, id)
 WHERE removed_at IS NOT NULL;
SQL);
    }

    public function down(): void
    {
        if (DB::table('products')->whereNotNull('recycle_expires_at')->orWhereNotNull('purge_completed_at')->exists()) {
            throw new LogicException('Recycle lifecycle data must be migrated explicitly before rolling back its columns.');
        }
        DB::unprepared(<<<'SQL'
DROP INDEX products_recycle_state_idx;
DROP INDEX products_recycle_due_idx;
ALTER TABLE products
 DROP CONSTRAINT products_purge_block_check,
 DROP CONSTRAINT products_purge_completion_check,
 DROP CONSTRAINT products_recycle_deadline_check,
 DROP CONSTRAINT products_recycle_state_check,
 DROP CONSTRAINT products_purge_status_check,
 DROP COLUMN purge_completed_at,
 DROP COLUMN purge_block_reason,
 DROP COLUMN purge_block_code,
 DROP COLUMN purge_status,
 DROP COLUMN recycle_expires_at;
SQL);
    }
};
