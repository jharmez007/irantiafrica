<?php

namespace App\Http\Controllers;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogAudit;
use App\Catalog\CatalogRead;
use App\Catalog\MediaStorage;
use App\Http\Middleware\CurrentIdentity;
use App\Http\Middleware\TrustedBrowser;
use App\Http\Requests\Catalog\CatalogRequest;
use App\Jobs\ProcessProductImage;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class CatalogMediaController
{
    public function __construct(private MediaStorage $storage, private CatalogActions $actions) {}

    public function intent(CatalogRequest $r): JsonResponse
    {
        Gate::authorize('media.manage');
        $data = $r->validated();
        $m = DB::transaction(function () use ($data): ProductMedia {
            $this->actions->lock();
            $product = Product::where('id', $data['product_id'])->lockForUpdate()->firstOrFail();
            abort_if($product->status === 'archived', 409);
            if (isset($data['variant_id']) && ! ProductVariant::where('product_id', $product->id)->whereKey($data['variant_id'])->exists()) {
                $this->actions->invalid('variant_id', 'Variant must belong to this product.');
            }
            if ($product->media()->whereNotIn('status', ['retired', 'rejected'])->count() >= 30) {
                $this->actions->invalid('product_id', 'At most thirty current images per product.');
            }
            $data['object_key'] = 'quarantine/'.Str::uuid();
            $data['status'] = 'quarantined';
            $m = ProductMedia::create($data);
            CatalogAudit::record('media_requested', 'media', $m->id);

            return $m;
        });

        return response()->json(['data' => ['id' => $m->id, 'upload' => $this->storage->upload($m)]], 201);
    }

    public function upload(CatalogRequest $r, string $id): JsonResponse
    {
        Gate::authorize('media.manage');
        abort_unless(config('catalog.disk') === 'local', 404);
        $m = ProductMedia::findOrFail($id);
        abort_unless($m->status === 'quarantined', 409);
        $file = $r->file('file');
        abort_unless($file instanceof UploadedFile, 422);
        if ($file->getSize() !== $m->byte_size || hash_file('sha256', $file->getPathname()) !== $m->checksum) {
            $this->actions->invalid('file', 'Upload does not match the declared size and checksum.');
        }
        $stream = fopen($file->getPathname(), 'rb');
        abort_unless(is_resource($stream), 503);
        try {
            abort_unless($this->storage->disk()->put($m->object_key, $stream, ['visibility' => 'private']) !== false, 503);
        } finally {
            fclose($stream);
        }

        return response()->json(['data' => ['id' => $m->id, 'status' => 'quarantined']]);
    }

    public function complete(CatalogRequest $r, string $id): JsonResponse
    {
        Gate::authorize('media.manage');
        $m = ProductMedia::findOrFail($id);
        abort_unless(in_array($m->status, ['quarantined', 'processing', 'ready'], true), 409);
        if ($m->status === 'quarantined') {
            if (! $this->storage->disk()->exists($m->object_key) || $this->storage->disk()->size($m->object_key) !== $m->byte_size) {
                $this->actions->invalid('file', 'Upload is missing or has the wrong size.');
            }
            DB::transaction(function () use ($id): void {
                $this->actions->lock();
                $m = ProductMedia::lockForUpdate()->findOrFail($id);
                abort_unless($m->status === 'quarantined', 409);
                $m->update(['status' => 'processing']);
                CatalogAudit::record('media_processing', 'media', $id);
            });
            ProcessProductImage::dispatch($id)->onQueue('media');
        }

        return response()->json(['data' => ['id' => $id, 'status' => $m->fresh()?->status]], 202);
    }

    public function updateMedia(CatalogRequest $r, string $id): JsonResponse
    {
        Gate::authorize('media.manage');
        DB::transaction(function () use ($r, $id): void {
            $this->actions->lock();
            $m = ProductMedia::lockForUpdate()->findOrFail($id);
            abort_if(in_array($m->status, ['retired', 'rejected'], true), 409);
            $before = $m->only(['alt_text', 'position']);
            $m->update($r->validated());
            Product::whereKey($m->product_id)->increment('content_version');
            CatalogAudit::record('media_updated', 'media', $id, ['before' => $before, 'after' => $m->only(['alt_text', 'position'])]);
        });

        return response()->json(['data' => ['id' => $id]]);
    }

    public function retire(CatalogRequest $r, string $id): Response
    {
        Gate::authorize('media.manage');
        DB::transaction(function () use ($id): void {
            $this->actions->lock();
            $m = ProductMedia::lockForUpdate()->findOrFail($id);
            $p = Product::findOrFail($m->product_id);
            if ($p->status === 'published' && $m->status === 'ready' && ! $p->media()->where('status', 'ready')->where('id', '!=', $id)->exists()) {
                $this->actions->invalid('media', 'Upload a ready replacement before retiring the last published image.');
            }
            $m->update(['status' => 'retired', 'retired_at' => now()]);
            $p->increment('content_version');
            CatalogAudit::record('media_retired', 'media', $id);
        });

        return response()->noContent();
    }

    public function image(Request $r, string $id, string $size): StreamedResponse
    {
        $m = ProductMedia::where('status', 'ready')->findOrFail($id);
        $public = CatalogRead::query(browse: false)->whereKey($m->product_id)->exists();
        if (! $public) {
            app(TrustedBrowser::class)->handle($r, function (Request $r): \Symfony\Component\HttpFoundation\Response {
                return app(CurrentIdentity::class)->handle($r, function (): \Symfony\Component\HttpFoundation\Response {
                    Gate::authorize('catalog.read_internal');

                    return response()->noContent();
                });
            });
        }
        $d = $m->derivatives[$size] ?? null;
        abort_unless(is_array($d), 404);

        $r->attributes->set('public_catalog_derivative', $public);

        return $this->storage->disk()->response($d['key'], null, ['Content-Type' => 'image/webp', 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => $public ? 'public, max-age=31536000, immutable' : 'private, no-store']);
    }
}
