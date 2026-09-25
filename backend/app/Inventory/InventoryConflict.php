<?php

namespace App\Inventory;

use Symfony\Component\HttpKernel\Exception\HttpException;

final class InventoryConflict extends HttpException
{
    public function __construct(public readonly string $inventoryCode, string $message)
    {
        parent::__construct(409, $message);
    }
}
