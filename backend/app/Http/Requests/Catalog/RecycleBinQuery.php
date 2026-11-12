<?php

namespace App\Http\Requests\Catalog;

use Illuminate\Foundation\Http\FormRequest;

final class RecycleBinQuery extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
            'previous_status' => ['sometimes', 'in:draft,published,archived'],
            'view' => ['sometimes', 'in:recent,expiring,pending,blocked,legacy'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'page_size' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
