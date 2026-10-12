<?php

namespace App\Communications;

use Illuminate\Mail\Mailable;

final class ContactMessageMail extends Mailable
{
    /** @param array{name:string,email:string,phone:?string,subject:string,message:string} $contact */
    public function __construct(public array $contact) {}

    public function build(): static
    {
        return $this->subject('New website message · IRANTI Africa')
            ->replyTo($this->contact['email'], $this->contact['name'])
            ->text('emails.contact-message')
            ->with(['contact' => $this->contact]);
    }
}
