<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

final class StorageTest extends TestCase
{
    public function test_private_local_storage_round_trip(): void
    {
        $key = 'foundation-tests/'.Str::uuid().'.txt';
        $disk = Storage::disk('local');
        try {
            $this->assertTrue($disk->put($key, 'foundation probe'));
            $this->assertSame('foundation probe', $disk->get($key));
            $this->assertSame('s3', config('filesystems.disks.s3.driver'));
        } finally {
            $disk->delete($key);
        }
    }
}
