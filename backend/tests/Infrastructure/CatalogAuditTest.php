<?php

namespace Tests\Infrastructure;

use App\Catalog\CatalogActions;
use App\Models\Product;
use App\Models\ProductMedia;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CatalogAuditTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        config(['catalog.disk' => 'local']);
        Storage::fake('local');
    }

    public function test_catalog_changes_capture_bounded_before_after_and_nullable_draft_description(): void
    {
        $actions = app(CatalogActions::class);
        $first = $actions->category(['name' => 'First', 'status' => 'active']);
        $second = $actions->category(['name' => 'Second', 'status' => 'active']);
        $product = $actions->product(['name' => 'Original', 'kind' => 'simple', 'description' => null, 'tax_category_code' => 'test', 'category_ids' => [$first->id]]);
        $this->assertSame('', $product->description);
        $description = str_repeat('Detailed catalog copy. ', 100);
        $product = $actions->product(['name' => 'Updated', 'description' => $description, 'content_version' => 1, 'category_ids' => [$second->id], 'password' => 'Never audit this'], $product->id);
        $event = DB::table('audit_logs')->where('action', 'catalog.product_updated')->where('subject_id', $product->id)->first();
        $changes = json_decode($event->changes, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('Original', $changes['before']['name']);
        $this->assertSame('Updated', $changes['after']['name']);
        $this->assertSame([$first->id], $changes['before']['category_ids']);
        $this->assertSame([$second->id], $changes['after']['category_ids']);
        $this->assertSame(500, mb_strlen($changes['after']['description']['preview']));
        $this->assertSame(mb_strlen($description), $changes['after']['description']['length']);
        $this->assertSame(hash('sha256', $description), $changes['after']['description']['sha256']);
        $this->assertStringNotContainsString('Never audit this', $event->changes);
        $this->assertSame('service', $event->actor_type);
        $product = $actions->product(['description' => null, 'content_version' => 2], $product->id);
        $this->assertSame('', $product->description);

        $actions->category(['name' => 'Child', 'parent_id' => $first->id], $second->id);
        $event = DB::table('audit_logs')->where('action', 'catalog.category_changed')->where('subject_id', $second->id)->where('changes->after->name', 'Child')->first();
        $changes = json_decode($event->changes, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('Second', $changes['before']['name']);
        $this->assertNull($changes['before']['parent_id']);
        $this->assertSame('Child', $changes['after']['name']);
        $this->assertSame($first->id, $changes['after']['parent_id']);
    }

    public function test_expired_intents_are_audited_once_while_current_and_processing_media_remain(): void
    {
        $product = Product::factory()->create();
        $expired = ProductMedia::create(['product_id' => $product->id, 'object_key' => 'quarantine/'.Str::uuid()]);
        $expired->forceFill(['created_at' => now()->subDays(2)])->save();
        $current = ProductMedia::create(['product_id' => $product->id, 'object_key' => 'quarantine/'.Str::uuid()]);
        $processing = ProductMedia::create(['product_id' => $product->id, 'object_key' => 'quarantine/'.Str::uuid(), 'status' => 'processing']);
        $processing->forceFill(['created_at' => now()->subDays(2)])->save();

        Artisan::call('catalog:media-maintenance');
        Artisan::call('catalog:media-maintenance');

        $this->assertSame('retired', $expired->fresh()->status);
        $this->assertSame('quarantined', $current->fresh()->status);
        $this->assertSame('processing', $processing->fresh()->status);
        $events = DB::table('audit_logs')->where('action', 'catalog.media_retired')->get();
        $this->assertCount(1, $events);
        $this->assertSame($expired->id, $events[0]->subject_id);
        $changes = json_decode($events[0]->changes, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('upload_intent_expired', $changes['reason']);
        $this->assertSame(['status' => 'quarantined'], $changes['before']);
        $this->assertSame(['status' => 'retired'], $changes['after']);
    }

    public function test_audit_failure_rolls_back_product_and_expired_intent_mutations(): void
    {
        $actions = app(CatalogActions::class);
        $product = $actions->product(['name' => 'Original', 'kind' => 'simple', 'tax_category_code' => 'test']);
        $expired = ProductMedia::create(['product_id' => $product->id, 'object_key' => 'quarantine/'.Str::uuid()]);
        $expired->forceFill(['created_at' => now()->subDays(2)])->save();
        DB::statement("ALTER TABLE audit_logs ADD CONSTRAINT test_catalog_audit_failure CHECK (action NOT IN ('catalog.product_updated', 'catalog.media_retired')) NOT VALID");
        try {
            foreach ([fn () => $actions->product(['name' => 'Must roll back', 'content_version' => 1], $product->id), fn () => Artisan::call('catalog:media-maintenance')] as $mutation) {
                try {
                    $mutation();
                    $this->fail('Expected audit insert failure.');
                } catch (QueryException $exception) {
                    $this->assertSame('23514', $exception->errorInfo[0]);
                }
            }
            $this->assertSame('Original', $product->fresh()->name);
            $this->assertSame(1, $product->fresh()->content_version);
            $this->assertSame('quarantined', $expired->fresh()->status);
            $this->assertNull($expired->fresh()->retired_at);
        } finally {
            DB::statement('ALTER TABLE audit_logs DROP CONSTRAINT test_catalog_audit_failure');
        }
    }
}
