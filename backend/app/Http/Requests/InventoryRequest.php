<?php

namespace App\Http\Requests;

use App\Inventory\StockMath;
use App\Rules\InventoryInteger;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

class InventoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return match ($this->route()?->getActionMethod()) {
            'opening' => ['quantity' => ['required', new InventoryInteger], 'reason' => ['required', 'string', 'max:500']],
            'adjust' => ['delta' => ['required', new InventoryInteger(-StockMath::MAX, true)], 'reason' => ['required', 'string', 'max:500'], 'expected_version' => ['required', 'string', 'regex:/^[1-9][0-9]{0,18}$/']],
            default => ['q' => ['sometimes', 'nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1', 'max:10000'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:100']],
        };
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->isMethod('GET')) {
                return;
            }
            foreach (array_diff(array_keys($this->all()), array_keys($this->rules())) as $key) {
                $validator->errors()->add($key, 'This field is not accepted.');
            }
            $key = $this->header('Idempotency-Key');
            if (! is_string($key) || ! Str::isUuid($key)) {
                $validator->errors()->add('Idempotency-Key', 'A UUID idempotency key is required.');
            }
            $reason = $this->input('reason');
            if (is_string($reason) && (trim($reason) === '' || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $reason))) {
                $validator->errors()->add('reason', 'A printable reason is required.');
            }
            $version = $this->input('expected_version');
            if (is_string($version) && strlen($version) === 19 && strcmp($version, '9223372036854775807') > 0) {
                $validator->errors()->add('expected_version', 'The inventory version exceeds its supported range.');
            }
        });
    }
}
