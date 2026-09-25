<?php

namespace App\Inventory;

use App\Catalog\CatalogRead;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Reservation;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;

/** Sole application boundary for stock mutations; controllers/jobs never write balances. */
final class InventoryService
{
    /** Read-only, advisory cart availability; never acquires or promises stock.
     * @param  list<string>  $variantIds
     * @return array<string,int>
     */
    public function availability(array $variantIds): array
    {
        $result = [];
        foreach (Inventory::whereIn('variant_id', $variantIds)->get() as $stock) {
            $result[$stock->variant_id] = $stock->available();
        }

        return $result;
    }

    public function initializeStock(string $variantId, mixed $quantity, string $reason, string $key, User $actor): InventoryMovement
    {
        $quantity = StockMath::integer($quantity);

        return $this->manual($variantId, $quantity, $reason, $key, $actor, null);
    }

    public function adjustStock(string $variantId, mixed $delta, string $reason, string $key, User $actor, string $expectedVersion): InventoryMovement
    {
        $delta = StockMath::integer($delta, -StockMath::MAX);
        if ($delta === 0 || ! preg_match('/^[1-9][0-9]{0,18}$/D', $expectedVersion) || (strlen($expectedVersion) === 19 && strcmp($expectedVersion, '9223372036854775807') > 0)) {
            throw new InvalidArgumentException('A nonzero delta and valid inventory version are required.');
        }

        return $this->manual($variantId, $delta, $reason, $key, $actor, $expectedVersion);
    }

    /**
     * Internal callers retain referenceId AND generation across retries. A new hold
     * requires an explicitly incremented generation, never an ambiguous replay.
     *
     * @param  array<array-key,mixed>  $items  Input validated as a nonempty list of variant_id/quantity pairs.
     */
    public function reserveMany(string $referenceId, array $items, int $generation = 1): Reservation
    {
        $referenceId = self::uuid($referenceId);
        StockMath::integer($generation);
        $canonical = $this->canonicalItems($items);
        $ttl = config('inventory.reservation_ttl_seconds');
        if (! is_int($ttl) || $ttl < 1 || $ttl > StockMath::MAX) {
            throw new \LogicException('Reservation TTL must be an integer between 1 and 2147483647 seconds.');
        }

        return $this->transaction(function () use ($referenceId, $canonical, $generation, $ttl): Reservation {
            DB::table('reservation_references')->insertOrIgnore(['id' => $referenceId]);
            DB::table('reservation_references')->where('id', $referenceId)->lockForUpdate()->firstOrFail();
            $latest = Reservation::where('reference_id', $referenceId)->orderByDesc('generation')->lockForUpdate()->first();
            if ($latest !== null) {
                if ($this->storedItems($latest->id) !== $canonical) {
                    throw new InventoryConflict('IDEMPOTENCY_CONFLICT', 'The complete item set for this reference cannot change.');
                }
                $existing = Reservation::where('reference_id', $referenceId)->where('generation', $generation)->first();
                if ($existing !== null) {
                    // Replay never extends TTL or acquires another generation.
                    return $existing->status === 'ACTIVE' ? $this->closeLocked($existing, 'EXPIRED')->reservation : $existing;
                }
                if ($latest->status === 'COMMITTED' || $latest->status === 'ACTIVE' || $generation !== $latest->generation + 1) {
                    throw new InventoryConflict('INVALID_RESERVATION_GENERATION', 'Close the previous hold before explicitly requesting the next generation.');
                }
            } elseif ($generation !== 1) {
                throw new InventoryConflict('INVALID_RESERVATION_GENERATION', 'A reference starts at generation one.');
            }

            $ids = array_keys($canonical);
            $variants = ProductVariant::whereIn('id', $ids)->get();
            if ($variants->count() !== count($ids)) {
                throw new InventoryConflict('VARIANT_UNAVAILABLE', 'Every requested variant must exist and be published.');
            }
            $productIds = $variants->pluck('product_id')->unique()->sort()->values()->all();
            // Catalog writes lock products before variants. Acquire all parent locks first.
            Product::whereIn('id', $productIds)->orderBy('id')->lockForUpdate()->get();
            $lockedVariants = ProductVariant::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $eligibleProducts = CatalogRead::query(false, false)->whereIn('id', $productIds)->pluck('id')->all();
            foreach ($lockedVariants as $variant) {
                if ($variant->status !== 'active' || ! in_array($variant->product_id, $eligibleProducts, true)) {
                    throw new InventoryConflict('VARIANT_UNAVAILABLE', 'An archived or unpublished variant cannot be reserved.');
                }
            }
            $stocks = Inventory::whereIn('variant_id', $ids)->orderBy('variant_id')->lockForUpdate()->get()->keyBy('variant_id');
            foreach ($canonical as $id => $quantity) {
                if (! isset($stocks[$id]) || $stocks[$id]->available() < $quantity) {
                    throw new InventoryConflict('INSUFFICIENT_STOCK', 'One or more variants have insufficient available stock.');
                }
            }
            $now = $this->databaseNow();
            $reservation = new Reservation;
            $reservation->forceFill(['reference_id' => $referenceId, 'generation' => $generation, 'status' => 'ACTIVE',
                'created_at' => $now, 'updated_at' => $now, 'expires_at' => $now->addSeconds($ttl)])->save();
            foreach ($canonical as $id => $quantity) {
                $itemId = (string) Str::uuid();
                DB::table('reservation_items')->insert(['id' => $itemId, 'reservation_id' => $reservation->id, 'variant_id' => $id, 'quantity' => $quantity]);
                $stock = $stocks->get($id) ?? throw new \LogicException('Locked inventory balance missing.');
                $this->move($stock, 'RESERVE', 0, $quantity, 'reservation:'.$reservation->id.':reserve:'.$id, 'Inventory reservation', null, $itemId);
            }

            return $reservation;
        });
    }

    /** Lock an existing hold and its catalog sources for atomic checkout-to-order promotion.
     * Does not reserve, renew or consume. Caller must keep the enclosing transaction open.
     */
    public function inspectForPromotion(string $reservationId): ReservationOutcome
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Promotion inspection requires an enclosing transaction.');
        }
        $reference = Reservation::findOrFail(self::uuid($reservationId))->reference_id;
        DB::table('reservation_references')->where('id', $reference)->lockForUpdate()->firstOrFail();
        $r = Reservation::where('id', $reservationId)->lockForUpdate()->firstOrFail();
        $ids = DB::table('reservation_items')->where('reservation_id', $r->id)->orderBy('variant_id')->pluck('variant_id');
        $parents = ProductVariant::whereIn('id', $ids)->pluck('product_id')->unique()->sort()->values();
        Product::whereIn('id', $parents)->orderBy('id')->lockForUpdate()->get();
        ProductVariant::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();

        return $this->closeLocked($r, 'EXPIRED');
    }

    public function release(string $reservationId): ReservationOutcome
    {
        return $this->transition($reservationId, 'RELEASED');
    }

    public function consume(string $reservationId): ReservationOutcome
    {
        return $this->transition($reservationId, 'COMMITTED');
    }

    public function expire(string $reservationId): ReservationOutcome
    {
        return $this->transition($reservationId, 'EXPIRED');
    }

    private function transition(string $reservationId, string $target): ReservationOutcome
    {
        $reservationId = self::uuid($reservationId);

        return $this->transaction(function () use ($reservationId, $target): ReservationOutcome {
            $referenceId = Reservation::findOrFail($reservationId)->reference_id;
            DB::table('reservation_references')->where('id', $referenceId)->lockForUpdate()->firstOrFail();
            $reservation = Reservation::lockForUpdate()->findOrFail($reservationId);

            return $this->closeLocked($reservation, $target);
        });
    }

    /** Reference and generation locks are already held. */
    private function closeLocked(Reservation $reservation, string $target): ReservationOutcome
    {
        if ($reservation->status !== 'ACTIVE') {
            return new ReservationOutcome($reservation->status === $target ? $target : 'RESERVATION_NO_LONGER_ACTIVE', $reservation);
        }
        $items = DB::table('reservation_items')->where('reservation_id', $reservation->id)->orderBy('variant_id')->get();
        $stocks = Inventory::whereIn('variant_id', $items->pluck('variant_id'))->orderBy('variant_id')->lockForUpdate()->get()->keyBy('variant_id');
        $now = $this->databaseNow(); // clock_timestamp, not transaction-start now().
        $expired = $reservation->expires_at->lessThanOrEqualTo($now);
        if ($target === 'EXPIRED' && ! $expired) {
            return new ReservationOutcome('NOT_DUE', $reservation);
        }
        $status = $expired ? 'EXPIRED' : $target;
        foreach ($items as $item) {
            $stock = $stocks->get($item->variant_id);
            if ($stock === null) {
                throw new \LogicException('A reserved inventory balance is missing.');
            }
            $quantity = StockMath::integer($item->quantity);
            $this->move($stock, $status === 'COMMITTED' ? 'SALE' : 'RELEASE',
                $status === 'COMMITTED' ? -$quantity : 0, -$quantity,
                'reservation:'.$reservation->id.':close:'.$item->variant_id,
                'Reservation '.strtolower($status), null, $item->id);
        }
        $reservation->forceFill(['status' => $status, 'closed_at' => $now, 'updated_at' => $now])->save();

        // Never throw here: expiry must commit even when a late consume is rejected.
        return new ReservationOutcome($status === $target ? $target : 'RESERVATION_NO_LONGER_ACTIVE', $reservation);
    }

    private function databaseNow(): CarbonImmutable
    {
        return new CarbonImmutable(DB::selectOne('SELECT clock_timestamp() AS time')->time);
    }

    /** @param array<array-key,mixed> $items Input validated as a nonempty list of variant_id/quantity pairs.
     * @return array<string,int>
     */
    private function canonicalItems(array $items): array
    {
        if ($items === [] || ! array_is_list($items)) {
            throw new InvalidArgumentException('A nonempty list of reservation items is required.');
        }
        $canonical = [];
        foreach ($items as $item) {
            if (! is_array($item) || count($item) !== 2 || ! isset($item['variant_id'], $item['quantity']) || ! is_string($item['variant_id'])) {
                throw new InvalidArgumentException('Each item requires only variant_id and integer quantity.');
            }
            $id = self::uuid($item['variant_id']);
            if (isset($canonical[$id])) {
                throw new InvalidArgumentException('Duplicate variants must be consolidated by the caller.');
            }
            $canonical[$id] = StockMath::integer($item['quantity']);
        }
        ksort($canonical);

        return $canonical;
    }

    /** @return array<string,int> */
    private function storedItems(string $reservationId): array
    {
        $result = [];
        foreach (DB::table('reservation_items')->where('reservation_id', $reservationId)->orderBy('variant_id')->get() as $item) {
            $result[$item->variant_id] = (int) $item->quantity;
        }

        return $result;
    }

    private function manual(string $variantId, int $delta, string $reason, string $key, User $actor, ?string $expectedVersion): InventoryMovement
    {
        $variantId = self::uuid($variantId);
        $key = self::uuid($key);
        $reason = trim($reason);
        if ($reason === '' || mb_strlen($reason) > 500 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $reason)) {
            throw new InvalidArgumentException('A reason of 1–500 printable characters is required.');
        }
        $kind = $expectedVersion === null ? 'OPENING' : 'ADJUSTMENT';
        $operation = 'inventory:'.strtolower($kind).':'.$actor->id.':'.$variantId.':'.$key;
        $hash = hash('sha256', json_encode([$kind, $variantId, $delta, $reason, $expectedVersion], JSON_THROW_ON_ERROR));

        return $this->transaction(function () use ($variantId, $delta, $reason, $actor, $expectedVersion, $kind, $operation, $hash): InventoryMovement {
            // Serialize with identity changes and then the per-variant balance, including absent opening rows.
            $currentActor = User::query()->lockForUpdate()->findOrFail($actor->id);
            abort_unless($currentActor->hasPermission('inventory.adjust'), 403);
            ProductVariant::query()->lockForUpdate()->findOrFail($variantId);
            $previous = InventoryMovement::where('operation_key', $operation)->first();
            if ($previous !== null) {
                $savedHash = DB::table('audit_logs')->where('subject_type', 'inventory_movement')->where('subject_id', $previous->id)->value('changes->request_hash');
                if (! is_string($savedHash) || ! hash_equals($savedHash, $hash)) {
                    throw new InventoryConflict('IDEMPOTENCY_CONFLICT', 'This operation key was already used with different input.');
                }

                return $previous;
            }
            $stock = Inventory::where('variant_id', $variantId)->lockForUpdate()->first();
            if ($expectedVersion === null) {
                if ($stock !== null) {
                    throw new InventoryConflict('INVENTORY_ALREADY_INITIALIZED', 'Opening stock already exists; use an adjustment.');
                }
                $stock = new Inventory;
                $stock->forceFill(['variant_id' => $variantId, 'on_hand' => 0, 'reserved' => 0, 'low_stock_threshold' => 0, 'version' => '1']);
            } else {
                if ($stock === null) {
                    throw new InventoryConflict('INVENTORY_NOT_INITIALIZED', 'Opening stock must be established first.');
                }
                if ($stock->version !== $expectedVersion) {
                    throw new InventoryConflict('INVENTORY_VERSION_CONFLICT', 'Stock changed; reload and review the adjustment.');
                }
            }
            $movement = $this->move($stock, $kind, $delta, 0, $operation, $reason, $currentActor->id);
            InventoryAudit::record($movement, $currentActor, $hash);

            return $movement;
        });
    }

    /** Caller holds the variant/balance lock inside the same transaction. */
    private function move(Inventory $stock, string $kind, int $onHandDelta, int $reservedDelta, string $operationKey, string $reason, ?string $actorId = null, ?string $itemId = null): InventoryMovement
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Inventory movement requires a transaction.');
        }
        $next = StockMath::apply($stock->on_hand, $stock->reserved, $onHandDelta, $reservedDelta);
        if ($stock->exists) {
            if ($stock->version === '9223372036854775807') {
                throw new InventoryConflict('STOCK_LIMIT_EXCEEDED', 'The inventory version limit requires maintenance.');
            }
            $stock->version = (string) ((int) $stock->version + 1);
        }
        $stock->on_hand = $next['on_hand'];
        $stock->reserved = $next['reserved'];
        $stock->save();
        $movement = new InventoryMovement;
        $movement->forceFill(['variant_id' => $stock->variant_id, 'actor_user_id' => $actorId,
            'operation_key' => $operationKey, 'kind' => $kind, 'on_hand_delta' => $onHandDelta,
            'reserved_delta' => $reservedDelta, 'on_hand_after' => $stock->on_hand,
            'reserved_after' => $stock->reserved, 'reason' => $reason]);
        if ($itemId !== null) {
            $movement->reservation_item_id = $itemId;
        }
        $movement->save();

        return $movement;
    }

    /** Restock only a physically received, inspected, saleable return; never from refund outcome. */
    public function restockReturn(string $returnItemId, User $actor): InventoryMovement
    {
        return $this->transaction(function () use ($returnItemId, $actor): InventoryMovement {
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->status === 'active' && $actor->hasPermission('inventory.adjust'), 403);
            $initial = DB::table('return_items')->where('id', $returnItemId)->firstOrFail();
            $order = Order::whereKey($initial->order_id)->lockForUpdate()->firstOrFail();
            $item = DB::table('return_items')->where('id', $returnItemId)->lockForUpdate()->firstOrFail();
            $operation = 'return:restock:'.$item->id;
            $previous = InventoryMovement::where('operation_key', $operation)->first();
            if ($previous) {
                return $previous;
            }
            if ($item->disposition !== 'SALEABLE' || ! $item->inspected_at || $item->received_quantity < 1 || $item->received_quantity !== $item->approved_quantity || $item->restocked_quantity !== 0 || $order->paid_at === null) {
                throw new InventoryConflict('RETURN_RESTOCK_INELIGIBLE', 'Only received and inspected saleable units may be restocked.');
            }
            $line = DB::table('order_items')->where('id', $item->order_item_id)->firstOrFail();
            ProductVariant::whereKey($line->variant_id)->lockForUpdate()->firstOrFail();
            $stock = Inventory::where('variant_id', $line->variant_id)->lockForUpdate()->firstOrFail();
            $movement = $this->move($stock, 'RESTOCK', $item->received_quantity, 0, $operation, 'Inspected saleable return '.$item->id, $actor->id);
            DB::table('return_items')->where('id', $item->id)->update(['restocked_quantity' => $item->received_quantity]);
            InventoryAudit::record($movement, $actor, hash('sha256', $operation));

            return $movement;
        });
    }

    public static function uuid(string $id): string
    {
        if (! Str::isUuid($id)) {
            throw new InvalidArgumentException('A UUID identifier is required.');
        }

        return strtolower($id);
    }

    /**
     * @template T
     *
     * @param  \Closure():T  $work
     * @return T
     */
    private function transaction(\Closure $work): mixed
    {
        // An outer checkout transaction must retry the whole order operation itself.
        if (DB::transactionLevel() > 0) {
            return DB::transaction($work);
        }
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction($work);
            } catch (QueryException $exception) {
                $state = $exception->errorInfo[0] ?? null;
                if (! in_array($state, ['40001', '40P01'], true)) {
                    throw $exception;
                }
                Log::warning('Inventory transaction concurrency failure', ['sqlstate' => $state, 'attempt' => $attempt, 'exhausted' => $attempt === 3]);
                if ($attempt === 3) {
                    throw $exception;
                }
                usleep(random_int(10000, 30000));
            }
        }
    }
}
