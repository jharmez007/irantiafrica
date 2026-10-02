<?php

namespace App\Catalog;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;

final class CatalogTax
{
    /** @return array{data: list<array{code: string, label: string}>, development_only: bool} */
    public function choices(): array
    {
        try {
            $configuration = app(CheckoutConfiguration::class)->current();
        } catch (CheckoutConflict $exception) {
            if ($exception->checkoutCode !== 'TAX_CONFIGURATION_REQUIRED') {
                throw $exception;
            }

            return ['data' => [], 'development_only' => false];
        }

        $choices = [];
        foreach ($configuration['payload']['product_rules'] as $rule) {
            if (! is_string($rule['category']) || ! is_string($rule['label'])) {
                throw new \LogicException('Invalid stored tax treatment.');
            }
            $choices[] = ['code' => $rule['category'], 'label' => $rule['label']];
        }
        if (! is_bool($configuration['development_only'])) {
            throw new \LogicException('Invalid stored configuration flag.');
        }

        return ['data' => $choices, 'development_only' => $configuration['development_only']];
    }
}
