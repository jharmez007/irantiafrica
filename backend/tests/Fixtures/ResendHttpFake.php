<?php

namespace Tests\Fixtures;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use Illuminate\Mail\Transport\ResendTransport;
use Illuminate\Support\Facades\Mail;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Resend\Client;
use Resend\Transporters\HttpTransporter;
use Resend\ValueObjects\ApiKey;
use Resend\ValueObjects\Transporter\BaseUri;
use Resend\ValueObjects\Transporter\Headers;

final class ResendHttpFake
{
    /** @var array<int, array{request: RequestInterface, options: array<string, mixed>}> */
    public array $history = [];

    /** @param list<ResponseInterface|\Throwable> $responses */
    public function __construct(private array $responses) {}

    public function install(): void
    {
        $stack = HandlerStack::create(new MockHandler($this->responses));
        $stack->push(Middleware::history($this->history));
        $client = new Client(new HttpTransporter(
            new GuzzleClient(['handler' => $stack]),
            BaseUri::from('https://api.resend.invalid'),
            Headers::withAuthorization(ApiKey::from('re_'.str_repeat('x', 24))),
        ));
        Mail::purge('resend');
        Mail::mailer('resend')->setSymfonyTransport(new ResendTransport($client));
    }
}
