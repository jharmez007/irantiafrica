<?php

namespace App\Checkout;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class NigeriaAddress
{
    /** Application identifiers, not an assertion of ISO subdivision codes.
     * @return array<string,string> */
    public static function states(): array
    {
        $names = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'];
        $result = [];
        foreach ($names as $name) {
            $result[strtoupper(str_replace(' ', '_', $name))] = $name;
        }

        return $result;
    }

    /**
     * @param  array<string,mixed>  $input
     * @return array<string,mixed>
     */
    public static function validate(array $input): array
    {
        $rules = ['recipient_name' => ['required', 'string', 'max:160'], 'phone' => ['required', 'string', 'max:32'],
            'line1' => ['required', 'string', 'max:255'], 'line2' => ['nullable', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:120'], 'state_code' => ['required', Rule::in(array_keys(self::states()))],
            'locality_code' => ['nullable', 'string', 'regex:/^[A-Z0-9_-]{1,120}$/D'],
            'postal_code' => ['nullable', 'string', 'max:20'], 'country_code' => ['required', Rule::in(['NG'])]];
        if (array_diff(array_keys($input), array_keys($rules))) {
            throw ValidationException::withMessages(['address' => 'Unknown address field.']);
        }
        $data = Validator::make($input, $rules)->validate();
        foreach ($data as $key => $value) {
            if (is_string($value)) {
                $data[$key] = trim($value);
                if (preg_match('/[\x00-\x1f\x7f]/', $value)) {
                    throw ValidationException::withMessages(['address.'.$key => 'Control characters are not accepted.']);
                }
            }
        }
        if (! preg_match('/^\+?[0-9 ().-]+$/D', $data['phone'])) {
            throw ValidationException::withMessages(['address.phone' => 'Enter a valid contact phone number.']);
        }
        $phone = preg_replace('/[ ().-]/', '', $data['phone']);
        if (! is_string($phone) || ! preg_match('/^\+?[0-9]{7,15}$/D', $phone)) {
            throw ValidationException::withMessages(['address.phone' => 'Enter a contact number with 7 to 15 digits.']);
        }
        if (preg_match('/^0[0-9]{10}$/D', $phone)) {
            $phone = '+234'.substr($phone, 1);
        }
        $data['phone'] = $phone;

        return $data;
    }
}
