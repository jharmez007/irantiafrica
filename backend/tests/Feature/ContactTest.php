<?php

namespace Tests\Feature;

use App\Communications\ContactMessageMail;
use App\Jobs\SendContactMessage;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class ContactTest extends TestCase
{
    /** @var array<string,string> */
    private array $jar = [];

    private string|false $previousLimitStore;

    /** @return array<string,string> */
    private function message(): array
    {
        return [
            'name' => 'Ada Okafor',
            'email' => 'ada@example.test',
            'phone' => '',
            'subject' => 'A question about a basket',
            'message' => 'Please tell me when this basket will be available.',
            'website' => '',
        ];
    }

    protected function setUp(): void
    {
        $this->previousLimitStore = getenv('RATE_LIMIT_CACHE_STORE');
        putenv('RATE_LIMIT_CACHE_STORE=array');
        $_ENV['RATE_LIMIT_CACHE_STORE'] = 'array';
        $_SERVER['RATE_LIMIT_CACHE_STORE'] = 'array';
        parent::setUp();
        config([
            'contact.recipient' => 'owner@irantiafrica.test',
            'cors.allowed_origins' => ['http://localhost:3000'],
            'sanctum.stateful' => ['localhost:3000'],
            'session.driver' => 'file',
            'cache.limiter' => 'array',
            'cache.stores.identity_limits' => ['driver' => 'array'],
        ]);
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        if ($this->previousLimitStore === false) {
            putenv('RATE_LIMIT_CACHE_STORE');
            unset($_ENV['RATE_LIMIT_CACHE_STORE'], $_SERVER['RATE_LIMIT_CACHE_STORE']);
        } else {
            putenv('RATE_LIMIT_CACHE_STORE='.$this->previousLimitStore);
            $_ENV['RATE_LIMIT_CACHE_STORE'] = $this->previousLimitStore;
            $_SERVER['RATE_LIMIT_CACHE_STORE'] = $this->previousLimitStore;
        }
    }

    /** @param array<string,mixed> $data */
    private function browser(string $method, string $path, array $data = [], bool $csrf = true, string $origin = 'http://localhost:3000'): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => $origin,
            'HTTP_REFERER' => $origin.'/', 'CONTENT_TYPE' => 'application/json'];
        if ($csrf && isset($this->jar['XSRF-TOKEN'])) {
            $server['HTTP_X_XSRF_TOKEN'] = $this->jar['XSRF-TOKEN'];
        }
        $response = $this->call($method, $path, [], $this->jar, [], $server, json_encode($data));
        foreach ($response->headers->getCookies() as $cookie) {
            $this->jar[$cookie->getName()] = $cookie->getValue();
        }

        return $response;
    }

    public function test_valid_message_queues_an_encrypted_identity_job_without_permanent_storage(): void
    {
        Queue::fake();

        $this->browser('POST', '/api/v1/contact', $this->message())
            ->assertStatus(202)
            ->assertJsonPath('data.message', 'Message received.');

        Queue::assertPushed(SendContactMessage::class, function (SendContactMessage $job): bool {
            $this->assertInstanceOf(ShouldBeEncrypted::class, $job);
            $this->assertSame('identity', $job->queue);
            $this->assertSame('ada@example.test', $job->contact['email']);

            return true;
        });
    }

    public function test_validation_rejects_invalid_email_missing_message_and_honeypot(): void
    {
        Queue::fake();
        $this->browser('POST', '/api/v1/contact', array_replace($this->message(), ['email' => 'not-an-email']))
            ->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION_ERROR')->assertJsonStructure(['error' => ['fields' => ['email']]]);
        $this->browser('POST', '/api/v1/contact', array_replace($this->message(), ['message' => '']))
            ->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['message']]]);
        $this->browser('POST', '/api/v1/contact', array_replace($this->message(), ['website' => 'spam.example']))
            ->assertStatus(422)->assertJsonStructure(['error' => ['fields' => ['website']]]);
        Queue::assertNothingPushed();
    }

    public function test_untrusted_origin_and_missing_recipient_fail_closed(): void
    {
        Queue::fake();
        $this->browser('POST', '/api/v1/contact', $this->message(), origin: 'https://untrusted.test')->assertStatus(403);
        $this->browser('POST', '/api/v1/contact', $this->message(), csrf: false)->assertStatus(419);
        config(['contact.recipient' => null]);
        $this->browser('POST', '/api/v1/contact', $this->message())->assertStatus(503);
        Queue::assertNothingPushed();
    }

    public function test_email_limiter_blocks_repeated_submissions(): void
    {
        Queue::fake();
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->browser('POST', '/api/v1/contact', $this->message())->assertStatus(202);
        }
        $this->browser('POST', '/api/v1/contact', $this->message())->assertStatus(429);
        Queue::assertPushed(SendContactMessage::class, 3);
    }

    public function test_worker_sends_plain_message_to_private_recipient_and_propagates_provider_failure(): void
    {
        $job = new SendContactMessage(array_replace($this->message(), ['phone' => null]));
        Mail::fake();
        $job->handle();
        Mail::assertSent(ContactMessageMail::class, function (ContactMessageMail $mail): bool {
            return $mail->hasTo('owner@irantiafrica.test')
                && $mail->contact['subject'] === 'A question about a basket';
        });

        Mail::shouldReceive('mailer')->once()->andThrow(new \RuntimeException('Synthetic provider failure'));
        $this->expectException(\RuntimeException::class);
        $job->handle();
    }
}
