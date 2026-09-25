<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class ReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return ['range' => ['sometimes', 'string', Rule::in(['today', '7d', '30d', 'custom'])],
            'from' => ['required_if:range,custom', 'prohibited_unless:range,custom', 'date_format:Y-m-d'],
            'to' => ['required_if:range,custom', 'prohibited_unless:range,custom', 'date_format:Y-m-d'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'stock' => ['sometimes', 'string', Rule::in(['all', 'low', 'out', 'uninitialized'])]];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), array_keys($this->rules())) as $key) {
                $validator->errors()->add($key, 'This report parameter is not accepted.');
            }
        });
    }
}
