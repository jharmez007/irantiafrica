<?php

namespace App\Jobs;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogAudit;
use App\Catalog\MediaStorage;
use App\Models\Product;
use App\Models\ProductMedia;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;

final class ProcessProductImage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    public int $backoff = 30;

    public function __construct(public string $mediaId) {}

    /** @return list<WithoutOverlapping> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping('image:'.$this->mediaId))->releaseAfter(70)->expireAfter(120)];
    }

    public function handle(MediaStorage $storage): void
    {
        $m = ProductMedia::findOrFail($this->mediaId);
        if ($m->status !== 'processing') {
            return;
        }
        $stream = $storage->disk()->readStream($m->object_key);
        if (! is_resource($stream)) {
            throw new \RuntimeException('Image source unavailable.');
        }
        try {
            $bytes = stream_get_contents($stream, (int) config('catalog.max_bytes') + 1);
        } finally {
            fclose($stream);
        }
        if ($bytes === false) {
            throw new \RuntimeException('Image source unreadable.');
        }
        $info = @getimagesizefromstring($bytes);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (strlen($bytes) !== $m->byte_size || hash('sha256', $bytes) !== $m->checksum || strlen($bytes) > (int) config('catalog.max_bytes') || ! $info || ! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) || $mime !== $m->mime_type || (int) config('catalog.max_pixels') < $info[0] * $info[1] || $info[0] < 1 || $info[1] < 1 || $info[0] > 16000 || $info[1] > 16000) {
            $this->reject();

            return;
        }
        if (ini_set('memory_limit', '256M') === false) {
            throw new \RuntimeException('Image worker requires a bounded 256M memory limit.');
        }
        $source = @imagecreatefromstring($bytes);
        unset($bytes);
        if (! $source) {
            $this->reject();

            return;
        }
        $derivatives = [];
        try {
            foreach (config('catalog.widths') as $size) {
                $width = min($size, $info[0]);
                $height = max(1, (int) round($info[1] * $width / $info[0]));
                $target = imagecreatetruecolor($width, $height);
                if (! $target) {
                    throw new \RuntimeException('Image allocation failed.');
                }
                imagealphablending($target, false);
                imagesavealpha($target, true);
                imagecopyresampled($target, $source, 0, 0, 0, 0, $width, $height, $info[0], $info[1]);
                ob_start();
                try {
                    if (! imagewebp($target, null, 82)) {
                        throw new \RuntimeException('Image encoding failed.');
                    } $encoded = ob_get_contents();
                } finally {
                    ob_end_clean();
                    imagedestroy($target);
                }
                $key = 'derivatives/'.$m->id.'/'.$size.'.webp';
                if (! is_string($encoded) || ! $storage->disk()->put($key, $encoded, ['visibility' => 'private', 'ContentType' => 'image/webp', 'CacheControl' => 'public,max-age=31536000,immutable'])) {
                    throw new \RuntimeException('Derivative storage failed.');
                }
                $derivatives[(string) $size] = ['key' => $key, 'width' => $width, 'height' => $height];
            }
        } finally {
            imagedestroy($source);
        }
        DB::transaction(function () use ($derivatives, $info): void {
            app(CatalogActions::class)->lock();
            $m = ProductMedia::lockForUpdate()->findOrFail($this->mediaId);
            if ($m->status !== 'processing') {
                return;
            }
            $m->update(['status' => 'ready', 'derivatives' => $derivatives, 'width' => $info[0], 'height' => $info[1]]);
            Product::whereKey($m->product_id)->increment('content_version');
            CatalogAudit::record('media_ready', 'media', $m->id);
        });
    }

    private function reject(): void
    {
        DB::transaction(function (): void {
            app(CatalogActions::class)->lock();
            $m = ProductMedia::lockForUpdate()->findOrFail($this->mediaId);
            if ($m->status === 'processing') {
                $m->update(['status' => 'rejected', 'retired_at' => now()]);
                CatalogAudit::record('media_rejected', 'media', $m->id);
            }
        });
    }

    public function failed(?\Throwable $exception): void
    {
        $this->reject();
    }
}
