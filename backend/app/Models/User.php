<?php

namespace App\Models;

use App\Notifications\RecoveryNotification;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/** @property list<string>|null $mfa_recovery_hashes */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'mfa_secret_ciphertext', 'mfa_recovery_hashes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasUuids, Notifiable;

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new RecoveryNotification($token));
    }

    /** @return BelongsToMany<Role, $this> */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')->withPivot(['id', 'granted_by'])->withTimestamps();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->status === 'active' && $this->roles()->whereHas('permissions', fn ($query) => $query->where('code', $permission))->exists();
    }

    public function isStaff(): bool
    {
        return $this->status === 'active' && $this->roles()->whereIn('code', ['owner', 'order_processing', 'inventory_store'])->exists();
    }

    protected $rememberTokenName = '';

    /** @return Attribute<string, string> */
    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => strtolower(trim($value)));
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'auth_version' => 'integer',
            'mfa_recovery_hashes' => 'array',
            'mfa_confirmed_at' => 'datetime',
            'mfa_last_used_step' => 'integer',
        ];
    }
}
