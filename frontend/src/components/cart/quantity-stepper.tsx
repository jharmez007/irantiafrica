import { useId } from "react";

export function QuantityStepper({
  value,
  min = 1,
  max,
  disabled = false,
  pending = false,
  label,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  pending?: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  const limitId = useId();
  return (
    <div
      className="quantity-stepper"
      role="group"
      aria-label={label}
      aria-busy={pending}
      aria-describedby={limitId}
    >
      <span id={limitId} className="sr-only">
        Maximum {max} {max === 1 ? "unit" : "units"}. Increase is unavailable at
        the maximum.
      </span>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-label={label}>{value}</output>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
