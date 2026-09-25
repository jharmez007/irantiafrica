<?php

namespace App\Console\Commands;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogAudit;
use App\Catalog\MediaStorage;
use App\Jobs\ProcessProductImage;
use App\Models\ProductMedia;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class ReconcileCatalogMedia extends Command
{
    protected $signature = 'catalog:media-maintenance';

    protected $description = 'Recover interrupted processing and clean aged retired or abandoned catalog objects';

    public function handle(MediaStorage $storage): int
    {
        ProductMedia::where('status', 'processing')->where('updated_at', '<', now()->subMinutes(15))->eachById(function (ProductMedia $m): void {
            ProcessProductImage::dispatch($m->id)->onQueue('media');
        });
        // Expired intents are older than their signed URL; no public or processing object is swept.
        $expiredBefore = now()->subDay();
        ProductMedia::where('status', 'quarantined')->where('created_at', '<', $expiredBefore)->eachById(function (ProductMedia $candidate) use ($expiredBefore): void {
            DB::transaction(function () use ($candidate, $expiredBefore): void {
                app(CatalogActions::class)->lock();
                $media = ProductMedia::whereKey($candidate->id)->where('status', 'quarantined')->where('created_at', '<', $expiredBefore)->lockForUpdate()->first();
                if ($media === null) {
                    return;
                }
                $media->update(['status' => 'retired', 'retired_at' => now()]);
                CatalogAudit::record('media_retired', 'media', $media->id, [
                    'product_id' => $media->product_id,
                    'reason' => 'upload_intent_expired',
                    'before' => ['status' => 'quarantined'],
                    'after' => ['status' => 'retired'],
                ]);
            });
        });
        ProductMedia::whereIn('status', ['retired', 'rejected'])->where('retired_at', '<', now()->subDays((int) config('catalog.retention_days')))->eachById(function (ProductMedia $m) use ($storage): void {
            // Keys are unique per media UUID. Include deterministic partial outputs from interrupted jobs.
            $keys = [$m->object_key];
            foreach (config('catalog.widths') as $width) {
                $keys[] = 'derivatives/'.$m->id.'/'.$width.'.webp';
            }
            $storage->disk()->delete($keys); // Retain metadata for audit/history; retries are safe.
        });

        return self::SUCCESS;
    }
}
