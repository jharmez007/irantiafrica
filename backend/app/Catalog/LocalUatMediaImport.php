<?php

namespace App\Catalog;

use App\Jobs\ProcessProductImage;
use App\Models\Product;
use App\Models\ProductMedia;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Imports a local UAT asset through the catalog's private storage and normal image processor. */
final class LocalUatMediaImport
{
    public function __construct(private CatalogActions $actions, private MediaStorage $storage) {}

    public function import(Product $product, string $path, string $alt): ProductMedia
    {
        if (! app()->environment('local') || config('catalog.disk') !== 'local') {
            throw new \RuntimeException('Local UAT image import requires the local environment and private local catalog disk.');
        }
        $root = realpath(base_path('../docs/uat/catalog-images'));
        $file = realpath($path);
        if ($root === false || $file === false || dirname($file) !== $root || ! is_file($file)) {
            throw new \RuntimeException('Image must be a regular file in docs/uat/catalog-images.');
        }
        $bytes = filesize($file);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file);
        $info = @getimagesize($file);
        if (! is_int($bytes) || $bytes < 1 || $bytes > (int) config('catalog.max_bytes') ||
            ! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) ||
            ! is_array($info) || $info[0] < 1 || $info[1] < 1 ||
            $info[0] > 16000 || $info[1] > 16000 ||
            (int) config('catalog.max_pixels') < $info[0] * $info[1] ||
            trim($alt) === '' || mb_strlen($alt) > 500) {
            throw new \RuntimeException('UAT image does not satisfy catalog upload limits.');
        }
        $checksum = hash_file('sha256', $file);
        if (! is_string($checksum)) {
            throw new \RuntimeException('UAT image checksum could not be calculated.');
        }
        $media = $product->media()->where('checksum', $checksum)->whereNotIn('status', ['rejected', 'retired'])->first();
        if ($media && $media->alt_text !== $alt) {
            throw new \RuntimeException('Existing UAT image has conflicting alternative text.');
        }
        if (! $media) {
            $media = DB::transaction(function () use ($product, $bytes, $mime, $checksum, $alt): ProductMedia {
                $this->actions->lock();
                $locked = Product::whereKey($product->id)->lockForUpdate()->firstOrFail();
                if ($locked->status === 'archived' || $locked->media()->whereNotIn('status', ['retired', 'rejected'])->count() >= 30) {
                    throw new \RuntimeException('Product cannot accept another image.');
                }
                $created = ProductMedia::create([
                    'product_id' => $locked->id,
                    'variant_id' => null,
                    'object_key' => 'quarantine/'.Str::uuid(),
                    'status' => 'quarantined',
                    'mime_type' => $mime,
                    'byte_size' => $bytes,
                    'checksum' => $checksum,
                    'alt_text' => $alt,
                    'position' => 0,
                ]);
                CatalogAudit::record('media_requested', 'media', $created->id);

                return $created;
            });
        }
        if ($media->status === 'ready') {
            foreach (config('catalog.widths') as $width) {
                $derivative = $media->derivatives[(string) $width] ?? null;
                if ($derivative === null || ! $this->storage->disk()->exists($derivative['key'])) {
                    throw new \RuntimeException('Existing UAT image is missing a required private derivative.');
                }
            }

            return $media;
        }
        if ($media->status === 'quarantined') {
            $stream = fopen($file, 'rb');
            if (! is_resource($stream)) {
                throw new \RuntimeException('UAT image could not be read.');
            }
            try {
                if (! $this->storage->disk()->put($media->object_key, $stream, ['visibility' => 'private'])) {
                    throw new \RuntimeException('Private UAT image upload failed.');
                }
            } finally {
                fclose($stream);
            }
            if ($this->storage->disk()->size($media->object_key) !== $bytes || hash_file('sha256', $file) !== $media->checksum) {
                throw new \RuntimeException('Private UAT image upload did not match the declared file.');
            }
            DB::transaction(function () use ($media): void {
                $this->actions->lock();
                $locked = ProductMedia::whereKey($media->id)->lockForUpdate()->firstOrFail();
                if ($locked->status !== 'quarantined') {
                    throw new \RuntimeException('UAT image changed state during upload.');
                }
                $locked->update(['status' => 'processing']);
                CatalogAudit::record('media_processing', 'media', $locked->id);
            });
        }
        ProcessProductImage::dispatchSync($media->id);
        $media->refresh();
        if ($media->status !== 'ready') {
            throw new \RuntimeException('UAT image processing did not produce a ready image.');
        }

        return $media;
    }
}
