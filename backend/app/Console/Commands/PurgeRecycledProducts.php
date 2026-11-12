<?php

namespace App\Console\Commands;

use App\Catalog\CatalogDeletion;
use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

final class PurgeRecycledProducts extends Command
{
    protected $signature = 'catalog:purge-recycled {--limit= : Maximum products to process}';

    protected $description = 'Permanently remove expired recycle-bin products when retention and stock safeguards permit';

    public function handle(CatalogDeletion $deletion): int
    {
        $limit = (int) ($this->option('limit') ?? config('catalog.purge_batch'));
        if ($limit < 1 || $limit > 500) {
            $this->error('Limit must be between 1 and 500.');

            return self::INVALID;
        }
        $ids = Product::query()->whereNotNull('removed_at')->whereNotNull('recycle_expires_at')
            ->where('recycle_expires_at', '<=', now())->whereNull('purge_completed_at')
            ->where(function ($query): void {
                $query->where('purge_status', 'recoverable')
                    ->orWhere(fn ($blocked) => $blocked->where('purge_status', 'blocked')->where('updated_at', '<=', now()->subDay()));
            })
            ->orderBy('recycle_expires_at')->orderBy('id')->limit($limit)->pluck('id');
        $summary = ['selected' => $ids->count(), 'completed' => 0, 'blocked' => 0, 'failed' => 0, 'not_due' => 0];
        foreach ($ids as $id) {
            try {
                $outcome = $deletion->purge($id, automatic: true)['outcome'];
                $summary[$outcome] = ($summary[$outcome] ?? 0) + 1;
            } catch (Throwable $exception) {
                $summary['failed']++;
                Log::error('Recycled product purge failed', ['product_id' => $id, 'exception' => $exception::class]);
                try {
                    $deletion->recordPurgeFailure($id);
                } catch (Throwable $recordingFailure) {
                    Log::critical('Recycled product purge failure state could not be recorded', ['product_id' => $id, 'exception' => $recordingFailure::class]);
                }
            }
        }
        Log::info('Recycled product purge batch completed', $summary);
        $this->info(json_encode($summary, JSON_THROW_ON_ERROR));

        return $summary['failed'] === 0 ? self::SUCCESS : self::FAILURE;
    }
}
