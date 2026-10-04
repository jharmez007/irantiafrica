<?php

namespace App\Http\Controllers;

use App\Identity\StaffAdministration;
use App\Identity\StaffInvitationMail;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class StaffController
{
    public function index(Request $request, StaffInvitationMail $mail): Response
    {
        $data = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1', 'max:10000']]);
        $users = User::whereHas('roles')->with('roles')->when($data['q'] ?? null, function ($q, $term): void {
            $q->where(fn ($q) => $q->where('name', 'ilike', '%'.$term.'%')->orWhere('email', 'ilike', '%'.$term.'%'));
        })->orderBy('name')->orderBy('id')->paginate(24);

        return response()->json(['data' => $users->getCollection()->map(fn ($user): array => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'status' => $user->status, 'roles' => $user->roles->pluck('code'), 'mfa_enrolled' => $user->mfa_confirmed_at !== null]), 'meta' => ['page' => $users->currentPage(), 'last_page' => $users->lastPage(), 'total' => $users->total()], 'mail_setup' => $mail->status()]);
    }

    public function provision(Request $request, StaffAdministration $staff, StaffInvitationMail $mail): Response
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => strtolower(trim($request->input('email')))]);
        }
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'role' => ['required', Rule::in(['owner', 'order_processing', 'inventory_store'])], 'permissions' => ['prohibited']]);
        if (! $mail->configured()) {
            throw ValidationException::withMessages(['email' => ['Email delivery is not configured. Configure a local email transport and start the queue worker before inviting staff.']]);
        }
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

    public function resendInvitation(Request $request, string $id, StaffAdministration $staff, StaffInvitationMail $mail): Response
    {
        if (! $mail->configured()) {
            throw ValidationException::withMessages(['email' => ['Email delivery is not configured. Configure a local email transport and start the queue worker before inviting staff.']]);
        }
        $staff->resendInvitation($request, $id);

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
