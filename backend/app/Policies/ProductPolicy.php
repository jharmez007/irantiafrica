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
        return $this->create($user) && $product->status !== 'archived';
    }

    public function publish(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.publish_archive') && $product->status !== 'archived';
    }

    public function archive(User $user, Product $product): bool
    {
        return Gate::forUser($user)->allows('catalog.publish_archive');
    }
}
