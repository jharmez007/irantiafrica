<?php

namespace App\Reporting;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Validation\ValidationException;

final class ReportWindow
{
    public function __construct(public CarbonImmutable $from, public CarbonImmutable $until, public string $timezone) {}

    /** @param array<string,mixed> $input */
    public static function fromInput(array $input, string $timezone): self
    {
        $today = CarbonImmutable::now($timezone)->startOfDay();
        $range = $input['range'] ?? '30d';
        if ($range === 'custom') {
            $from = CarbonImmutable::createFromFormat('!Y-m-d', $input['from'], $timezone);
            $to = CarbonImmutable::createFromFormat('!Y-m-d', $input['to'], $timezone);
            if (! $from || ! $to || $from->year < 1 || $from->gt($to) || $to->gt($today) || $from->diffInDays($to) > 365) {
                throw ValidationException::withMessages(['from' => 'Select an ordered range of at most 366 days, ending no later than today.']);
            }
        } else {
            $from = $today->subDays(match ($range) {
                'today' => 0, '7d' => 6, default => 29
            });
            $to = $today;
        }

        return new self($from->utc(), $to->addDay()->utc(), $timezone);
    }

    public function apply(Builder $query, string $column): Builder
    {
        return $query->where($column, '>=', $this->from)->where($column, '<', $this->until);
    }

    /** @return array<string,string> */
    public function meta(): array
    {
        return ['from' => $this->from->setTimezone($this->timezone)->toDateString(), 'to' => $this->until->subDay()->setTimezone($this->timezone)->toDateString(), 'timezone' => $this->timezone, 'from_utc' => $this->from->toIso8601String(), 'until_utc_exclusive' => $this->until->toIso8601String()];
    }
}
