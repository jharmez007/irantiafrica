<?php

namespace App\Http\Controllers;

use App\Identity\StaffMfa;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class MfaController
{
    public function enroll(Request $request, StaffMfa $mfa): JsonResponse
    {
        return response()->json(['data' => $mfa->enroll($request)]);
    }

    public function confirm(Request $request, StaffMfa $mfa): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'regex:/^\d{6}$/']]);

        return response()->json(['data' => ['recovery_codes' => $mfa->confirm($request, $data['code'])]]);
    }

    public function challenge(Request $request, StaffMfa $mfa): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:64'], 'recovery' => ['sometimes', 'boolean']]);
        $mfa->challenge($request, $data['code'], (bool) ($data['recovery'] ?? false));

        return response()->json(['data' => ['message' => 'Authentication complete.']]);
    }

    public function regenerate(Request $request, StaffMfa $mfa): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:1024'], 'code' => ['required', 'string', 'regex:/^\d{6}$/']]);

        return response()->json(['data' => ['recovery_codes' => $mfa->regenerate($request, $data['password'], $data['code'])]]);
    }

    public function reauthenticate(Request $request, StaffMfa $mfa): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:1024'], 'code' => ['required', 'string', 'regex:/^\d{6}$/']]);
        $mfa->reauthenticate($request, $data['password'], $data['code']);

        return response()->json(['data' => ['message' => 'Authentication confirmed.']]);
    }
}
