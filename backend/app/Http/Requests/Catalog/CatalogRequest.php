<?php

namespace App\Http\Requests\Catalog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class CatalogRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('sku'))) {
            $this->merge(['sku' => mb_strtoupper(trim($this->input('sku')))]);
        }
        if (in_array($this->route()?->getActionMethod(), ['updateSwatch', 'updateValue'], true) && $this->has('swatch_hex')) {
            $this->merge(['swatch_hex' => $this->normalizeHexInput($this->input('swatch_hex'))]);
        }
        if (in_array($this->route()?->getActionMethod(), ['addOption', 'addValues'], true) && is_array($this->input('values'))) {
            $values = array_map(function (mixed $value): mixed {
                if (is_string($value)) {
                    return ['value' => $value, 'swatch_hex' => null];
                }
                if (is_array($value) && array_key_exists('swatch_hex', $value)) {
                    $value['swatch_hex'] = $this->normalizeHexInput($value['swatch_hex']);
                }

                return $value;
            }, $this->input('values'));
            $this->merge(['values' => $values]);
        }
    }

    private function normalizeHexInput(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        return trim($value) === '' ? null : strtoupper(trim($value));
    }

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $slug = ['sometimes', 'string', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'];
        $price = ['required', 'string', 'regex:/^(0|[1-9][0-9]{0,14})$/'];

        return match ($this->route()?->getActionMethod()) {
            'createProduct' => ['name' => ['required', 'string', 'max:200'], 'slug' => [...$slug, 'max:220'], 'description' => ['sometimes', 'nullable', 'string', 'max:20000'], 'kind' => ['sometimes', 'in:simple,variant'], 'tax_category_code' => ['sometimes', 'nullable', 'string', 'max:64'], 'category_ids' => ['sometimes', 'array', 'max:30'], 'category_ids.*' => ['uuid', 'distinct', 'exists:categories,id']],
            'updateProduct' => ['name' => ['sometimes', 'required', 'string', 'max:200'], 'description' => ['sometimes', 'nullable', 'string', 'max:20000'], 'tax_category_code' => ['sometimes', 'nullable', 'string', 'max:64'], 'content_version' => ['required', 'integer', 'min:1'], 'category_ids' => ['sometimes', 'array', 'max:30'], 'category_ids.*' => ['uuid', 'distinct', 'exists:categories,id']],
            'publication', 'archive', 'restore', 'deleteProduct' => ['content_version' => ['required', 'integer', 'min:1']],
            'createCategory', 'updateCategory' => ['name' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'required', 'string', 'max:160'], 'slug' => $this->isMethod('POST') ? [...$slug, 'max:180'] : ['prohibited'], 'status' => ['sometimes', 'in:draft,active,archived'], 'parent_id' => ['sometimes', 'nullable', 'uuid', 'exists:categories,id']],
            'addValues' => ['values' => ['required', 'array', 'min:1', 'max:50'], 'values.*' => ['required', 'array:value,swatch_hex'], 'values.*.value' => ['required', 'string', 'max:120', 'distinct:ignore_case'], 'values.*.swatch_hex' => ['nullable', 'string', 'regex:/^#[0-9A-F]{6}$/']],
            'addOption' => ['name' => ['required', 'string', 'max:100'], 'position' => ['sometimes', 'integer', 'min:0', 'max:1000'], 'values' => ['required', 'array', 'min:1', 'max:50'], 'values.*' => ['required', 'array:value,swatch_hex'], 'values.*.value' => ['required', 'string', 'max:120', 'distinct:ignore_case'], 'values.*.swatch_hex' => ['nullable', 'string', 'regex:/^#[0-9A-F]{6}$/']],
            'removeOption' => ['content_version' => ['required', 'integer', 'min:1']],
            'removeValue' => ['content_version' => ['required', 'integer', 'min:1'], 'reassign_variant_media' => ['sometimes', 'boolean']],
            'updateValue' => ['value' => ['required', 'string', 'max:120'], 'swatch_hex' => ['present', 'nullable', 'string', 'regex:/^#[0-9A-F]{6}$/'], 'content_version' => ['required', 'integer', 'min:1']],
            'updateSwatch' => ['swatch_hex' => ['present', 'nullable', 'string', 'regex:/^#[0-9A-F]{6}$/'], 'content_version' => ['required', 'integer', 'min:1']],
            'createVariant' => ['sku' => ['required', 'string', 'max:100', 'regex:/^[^\x00-\x1F\x7F]+$/u'], 'unit_price_minor' => $price, 'currency' => ['sometimes', 'in:NGN'], 'option_value_ids' => ['present', 'array', 'max:10'], 'option_value_ids.*' => ['uuid', 'distinct', 'exists:option_values,id']],
            'updateVariant' => ['unit_price_minor' => ['sometimes', ...$price], 'status' => ['sometimes', 'in:active,archived'], 'price_version' => ['required', 'integer', 'min:1']],
            'intent' => ['product_id' => ['required', 'uuid', 'exists:products,id'], 'variant_id' => ['nullable', 'uuid', 'exists:product_variants,id'], 'mime_type' => ['required', 'in:image/jpeg,image/png,image/webp'], 'byte_size' => ['required', 'integer', 'min:1', 'max:10485760'], 'checksum' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'], 'alt_text' => ['required', 'string', 'max:500'], 'position' => ['sometimes', 'integer', 'min:0', 'max:1000']],
            'updateMedia' => ['alt_text' => ['sometimes', 'required', 'string', 'max:500'], 'position' => ['sometimes', 'integer', 'min:0', 'max:1000'], 'variant_id' => ['sometimes', 'nullable', 'uuid', 'exists:product_variants,id']],
            'upload' => ['file' => ['required', 'file', 'max:10240']],
            default => [],
        };
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $allowed = array_filter(array_keys($this->rules()), fn (string $key): bool => ! str_contains($key, '.'));
            $body = $this->isJson() ? $this->json()->all() : array_merge($this->request->all(), $this->allFiles());
            foreach (array_diff(array_keys($body), $allowed) as $key) {
                $validator->errors()->add($key, 'This field is not accepted.');
            }
        });
    }
}
