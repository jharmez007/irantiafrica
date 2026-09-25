<?php

namespace App\Http\Controllers;

use App\Cart\CartService;
use App\Cart\CartSession;
use App\Http\Requests\CartRequest;
use Illuminate\Http\JsonResponse;

final class CartController
{
    public function __construct(private CartService $cart, private CartSession $session) {}

    public function show(CartRequest $r): JsonResponse
    {
        return $this->session->response($this->cart->view($this->session->user($r), $this->session->token($r)), $r);
    }

    public function add(CartRequest $r): JsonResponse
    {
        return $this->session->response($this->cart->addItem($this->session->user($r), $this->session->token($r), strtolower($r->validated('variant_id')), $r->validated('quantity'), $r->validated('expected_version')), $r);
    }

    public function update(CartRequest $r, string $id): JsonResponse
    {
        return $this->session->response($this->cart->updateItem($this->session->user($r), $this->session->token($r), $id, $r->validated('quantity'), $r->validated('expected_version')), $r);
    }

    public function remove(CartRequest $r, string $id): JsonResponse
    {
        return $this->session->response($this->cart->removeItem($this->session->user($r), $this->session->token($r), $id, $r->validated('expected_version')), $r);
    }

    public function clear(CartRequest $r): JsonResponse
    {
        return $this->session->response($this->cart->clear($this->session->user($r), $this->session->token($r), $r->validated('expected_version')), $r);
    }
}
