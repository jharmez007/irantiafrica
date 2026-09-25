<?php

namespace App\Http\Controllers;

use App\Identity\StaffAdministration;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class StaffController
{
    public function provision(Request $request, StaffAdministration $staff): Response
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => strtolower(trim($request->input('email')))]);
        }
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'role' => ['required', Rule::in(['owner', 'order_processing', 'inventory_store'])], 'permissions' => ['prohibited']]);
        try {
            $user = $staff->provision($request, $data['name'], $data['email'], $data['role']);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => ['Unable to provision this identity.']]);
        }

        return response()->json(['data' => ['id' => $user->id, 'message' => 'Staff account created. Password setup and MFA enrollment are required.']], 201);
    }

    public function role(Request $request, string $id, StaffAdministration $staff): Response
    {
        $data = $request->validate(['role' => ['required', Rule::in(['owner', 'order_processing', 'inventory_store'])], 'permissions' => ['prohibited']]);
        $staff->changeRole($request, $id, $data['role']);

        return response()->noContent();
    }

    public function disable(Request $request, string $id, StaffAdministration $staff): Response
    {
        $staff->disable($request, $id);

        return response()->noContent();
    }

    public function resetMfa(Request $request, string $id, StaffAdministration $staff): Response
    {
        $data = $request->validate(['reason' => ['required', Rule::in(['lost_authenticator', 'suspected_compromise', 'device_replacement'])]]);
        $staff->resetMfa($request, $id, $data['reason']);

        return response()->noContent();
    }
}
