<?php

namespace Database\Factories;

use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Product> */
class ProductFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return ['name' => 'Demonstration product', 'slug' => 'demo-'.Str::uuid(), 'description' => 'Test fixture, not client catalog data.', 'kind' => 'simple', 'status' => 'draft', 'tax_category_code' => 'test-unconfigured'];
    }
}
