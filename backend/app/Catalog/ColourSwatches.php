<?php

namespace App\Catalog;

final class ColourSwatches
{
    public static function isColourOption(string $name): bool
    {
        return preg_match('/^(?:colou?r|colou?rway)$/i', trim($name)) === 1;
    }

    public static function normalize(mixed $hex): ?string
    {
        if ($hex === null || (is_string($hex) && trim($hex) === '')) {
            return null;
        }

        if (! is_string($hex)) {
            return null;
        }

        $hex = strtoupper(trim($hex));

        return preg_match('/^#[0-9A-F]{6}$/', $hex) === 1 ? $hex : null;
    }
}
