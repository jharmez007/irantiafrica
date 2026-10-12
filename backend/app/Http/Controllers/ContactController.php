<?php

namespace App\Http\Controllers;

use App\Jobs\SendContactMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ContactController
{
    public function store(Request $request): JsonResponse
    {
        $recipient = config('contact.recipient');
        abort_unless(is_string($recipient) && filter_var($recipient, FILTER_VALIDATE_EMAIL), 503);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'phone' => ['nullable', 'string', 'max:30'],
            'subject' => ['required', 'string', 'min:3', 'max:140'],
            'message' => ['required', 'string', 'min:10', 'max:4000'],
            'website' => ['nullable', 'string', 'size:0'],
        ]);

        SendContactMessage::dispatch([
            'name' => trim($data['name']),
            'email' => strtolower(trim($data['email'])),
            'phone' => isset($data['phone']) ? trim($data['phone']) : null,
            'subject' => trim($data['subject']),
            'message' => trim($data['message']),
        ])->onQueue('identity');

        return response()->json(['data' => ['message' => 'Message received.']], 202)
            ->header('Cache-Control', 'no-store');
    }
}
