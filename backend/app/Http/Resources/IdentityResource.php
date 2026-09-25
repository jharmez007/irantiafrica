<?php

namespace App\Http\Resources;

use App\Identity\MfaState;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/** @mixin User */
final class IdentityResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'email' => $this->email,
            'authentication_state' => $this->isStaff() ? (MfaState::complete($request, $this->resource) ? 'authenticated' : ($this->mfa_confirmed_at ? 'mfa_required' : 'enrollment_required')) : 'authenticated',
            'email_verified' => $this->email_verified_at !== null, 'roles' => $this->roles()->pluck('code')->all(),
            // UI discovery only; every privileged endpoint still authorizes independently.
            'permissions' => $this->isStaff() && MfaState::complete($request, $this->resource)
                ? DB::table('permissions')->join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
                    ->join('user_roles', 'user_roles.role_id', '=', 'role_permissions.role_id')
                    ->where('user_roles.user_id', $this->id)->distinct()->orderBy('permissions.code')->pluck('permissions.code')->all()
                : [],
        ];
    }
}
