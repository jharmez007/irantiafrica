<?php

namespace App\Http\Requests\Catalog;

use Illuminate\Foundation\Http\FormRequest;

class CatalogQuery extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['q' => ['sometimes', 'nullable', 'string', 'max:100'], 'category' => ['sometimes', 'string', 'max:180', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'], 'page' => ['sometimes', 'integer', 'min:1', 'max:10000'], 'page_size' => ['sometimes', 'integer', 'min:1', 'max:100'], 'sort' => ['sometimes', 'in:newest,price_asc,price_desc,name'], 'min_price' => ['sometimes', 'string', 'regex:/^(0|[1-9][0-9]{0,14})$/'], 'max_price' => ['sometimes', 'string', 'regex:/^(0|[1-9][0-9]{0,14})$/']];
    }
}
