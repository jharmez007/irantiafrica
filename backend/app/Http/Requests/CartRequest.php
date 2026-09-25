<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

final class CartRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        if ($this->isMethod('GET')) {
            return [];
        }
        $integer = fn (int $max) => function (string $attribute, mixed $value, \Closure $fail) use ($max): void {
            if (! is_int($value) || $value < 1 || $value > $max) {
                $fail('The '.$attribute.' must be a whole number from 1 to '.$max.'.');
            }
        };
        $rules = ['expected_version' => ['required', $integer(2147483647)]];
        if ($this->isMethod('POST') || $this->isMethod('PATCH')) {
            $rules['quantity'] = ['required', $integer((int) config('cart.max_quantity'))];
        }
        if ($this->isMethod('POST')) {
            $rules['variant_id'] = ['required', 'uuid'];
        }

        return $rules;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), array_keys($this->rules())) as $field) {
                $validator->errors()->add($field, 'This field is not accepted.');
            }
        });
    }
}
