<?php

namespace App\Policies;

use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

class ProductPolicy
{
    public function viewAny(User $user): bool
    {
        return Gate::forUser($user)->allows('catalog.read_internal');
    }

    public function view(User $user, Product $product): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return Gate::forUser($user)->allows('catalog.create_update');
    }

    public function update(User $user, Product $product): bool
    {
        return $this->create($user) && $product->status !== 'archived' && $product->removed_at === null;
    }

    public function publish(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.publish_archive') && $product->status !== 'archived' && $product->removed_at === null;
    }

    public function archive(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.publish_archive') && $product->removed_at === null;
    }

    public function restore(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.publish_archive') && $product->removed_at === null;
    }

    public function viewRecycleBin(User $user): bool
    {
        return Gate::forUser($user)->allows('catalog.recycle.view');
    }

    public function remove(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.recycle.move') && $product->purge_status !== 'completed';
    }

    public function restoreRemoval(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.recycle.restore')
            && $product->removed_at !== null
            && $product->purge_status !== 'completed'
            && ($product->recycle_expires_at === null || $product->recycle_expires_at->isFuture());
    }

    public function delete(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.recycle.purge') && $product->removed_at !== null;
    }
}
