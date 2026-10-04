<?php

namespace App\Catalog;

use App\Models\ProductMedia;
use Aws\S3\PostObjectV4;
use Illuminate\Filesystem\AwsS3V3Adapter;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

final class MediaStorage
{
    public function disk(): FilesystemAdapter
    {
        return Storage::disk((string) config('catalog.disk'));
    }

    /** Write only to the private catalog disk; R2 rejects the ACL header emitted by Flysystem's S3 upload. */
    public function putPrivate(string $key, mixed $body, string $contentType, ?string $cacheControl = null): bool
    {
        $disk = $this->disk();
        if (config('catalog.upload_transport') === 'proxy' && $disk instanceof AwsS3V3Adapter) {
            $options = ['Bucket' => $disk->getConfig()['bucket'], 'Key' => $key, 'Body' => $body, 'ContentType' => $contentType];
            if ($cacheControl !== null) {
                $options['CacheControl'] = $cacheControl;
            }

            try {
                // The bucket itself is private. No x-amz-acl header is sent.
                $disk->getClient()->putObject($options);

                return true;
            } catch (\Throwable) {
                return false;
            }
        }

        $options = ['visibility' => 'private', 'ContentType' => $contentType];
        if ($cacheControl !== null) {
            $options['CacheControl'] = $cacheControl;
        }

        return $disk->put($key, $body, $options) !== false;
    }

    /** @return array{url:string,fields:array<string,string>,transport:string} */
    public function upload(ProductMedia $media): array
    {
        if (config('catalog.disk') === 'local' || config('catalog.upload_transport') === 'proxy') {
            // The signed, authenticated application endpoint can stream a bounded
            // upload into a private S3-compatible disk, including R2, which does
            // not support S3 browser POST policies.
            return ['url' => URL::temporarySignedRoute('catalog.upload', now()->addMinutes(10), ['id' => $media->id], false), 'fields' => [], 'transport' => 'local'];
        }
        $disk = $this->disk();
        if (! $disk instanceof AwsS3V3Adapter || $media->checksum === null || $media->mime_type === null || $media->byte_size === null) {
            throw new \LogicException('S3 upload configuration is incomplete.');
        }
        // A POST policy enforces size. A presigned PUT does not sign Content-Length.
        // All provider-specific signing is confined to this storage adapter.
        $fields = ['key' => $media->object_key, 'Content-Type' => $media->mime_type, 'x-amz-meta-sha256' => $media->checksum];
        $conditions = [['bucket' => $disk->getConfig()['bucket']], ['key' => $media->object_key], ['Content-Type' => $media->mime_type], ['x-amz-meta-sha256' => $media->checksum], ['content-length-range', $media->byte_size, $media->byte_size]];
        $post = new PostObjectV4($disk->getClient(), $disk->getConfig()['bucket'], $fields, $conditions, '+10 minutes');

        return ['url' => $post->getFormAttributes()['action'], 'fields' => $post->getFormInputs(), 'transport' => 's3-post'];
    }

    /** @return list<array{url:string,width:int,height:int}> */
    public function sources(ProductMedia $media, bool $public = true): array
    {
        if ($media->status !== 'ready') {
            return [];
        }
        $result = [];
        foreach ($media->derivatives as $size => $item) {
            // The CDN must use this controlled HTTP origin, never an open bucket prefix.
            $origin = $public ? rtrim((string) config('catalog.public_origin'), '/') : '';
            $result[$item['width']] = ['url' => $origin.'/api/v1/media/'.$media->id.'/'.$size, 'width' => $item['width'], 'height' => $item['height']];
        }
        ksort($result);

        return array_values($result);
    }
}
