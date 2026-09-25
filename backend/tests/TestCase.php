<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        // Ephemeral test encryption key, never a production credential.
        $key = 'base64:'.base64_encode(random_bytes(32));
        putenv('APP_KEY='.$key);
        $_ENV['APP_KEY'] = $key;
        $_SERVER['APP_KEY'] = $key;
        parent::setUp();
    }
}
