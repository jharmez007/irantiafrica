"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, Input, Modal } from "@/components/ui";
import {
  isColourOption,
  normalizeSwatchHex,
  suggestedSwatch,
} from "@/lib/colour-swatches";

export type ChoiceInput = { value: string; swatch_hex: string | null };
type ChoiceDraft = { name: string; hex: string; touched: boolean };

function swatchForSave(hex: string): string | null | false {
  return hex.trim() === "" ? null : (normalizeSwatchHex(hex) ?? false);
}

export function SwatchField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="admin-swatch-field">
      <span className="admin-swatch-label">{label}</span>
      <div className="admin-swatch-controls">
        <label htmlFor={`${id}-picker`} className="sr-only">
          Choose {label.toLowerCase()} with colour picker
        </label>
        <input
          id={`${id}-picker`}
          type="color"
          value={normalizeSwatchHex(value) ?? "#FFFFFF"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <label htmlFor={`${id}-hex`} className="sr-only">
          {label} hex
        </label>
        <Input
          id={`${id}-hex`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#RRGGBB (optional)"
          maxLength={16}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function ColourValueDialog({
  mode,
  initialName = "",
  initialSwatch = null,
  existingNames,
  onClose,
  returnFocusTo,
  busy,
  save,
}: {
  mode: "create" | "edit";
  initialName?: string;
  initialSwatch?: string | null;
  existingNames: string[];
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  busy: boolean;
  save: (name: string, hex: string | null) => Promise<void>;
}) {
  const [colourName, setColourName] = useState(initialName);
  const [hex, setHex] = useState(initialSwatch ?? "");
  const [touched, setTouched] = useState(mode === "edit");
  const [nameError, setNameError] = useState("");
  const [swatchError, setSwatchError] = useState("");
  const [saveError, setSaveError] = useState("");
  const nameErrorId = useId();
  const title = mode === "create" ? "Add colour" : "Edit colour";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = normaliseName(colourName);
    if (!name) {
      setNameError("Enter a colour name.");
      return;
    }
    if (
      existingNames.some(
        (existing) =>
          normaliseName(existing).toLowerCase() === name.toLowerCase(),
      )
    ) {
      setNameError(`${name} has already been added.`);
      return;
    }
    const normalized = swatchForSave(hex);
    if (normalized === false) {
      setSwatchError(
        "Enter a six-digit hex colour such as #335438, or leave blank.",
      );
      return;
    }
    try {
      await save(name, normalized);
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The colour could not be saved. Please retry.",
      );
    }
  }
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={title}
      className="catalog-colour-modal"
      returnFocusTo={returnFocusTo}
      initialFocus="input"
    >
      <form className="admin-colour-value-form" onSubmit={submit}>
        <label>
          Name
          <Input
            autoFocus
            value={colourName}
            onChange={(event) => {
              const next = event.target.value;
              setColourName(next);
              if (mode === "create" && !touched)
                setHex(suggestedSwatch(next) ?? "");
              setNameError("");
              setSaveError("");
            }}
            maxLength={120}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? nameErrorId : undefined}
          />
        </label>
        {nameError && (
          <span id={nameErrorId} className="field-error" role="alert">
            {nameError}
          </span>
        )}
        <SwatchField
          label="Swatch"
          value={hex}
          onChange={(next) => {
            setHex(next);
            setTouched(true);
            setSwatchError("");
            setSaveError("");
          }}
          error={swatchError}
        />
        {saveError && (
          <p className="field-error" role="alert">
            {saveError}
          </p>
        )}
        <div className="admin-colour-form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {mode === "create" ? "Add colour" : "Save colour"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AddOptionForm({
  busy,
  save,
}: {
  busy: boolean;
  save: (name: string, values: (string | ChoiceInput)[]) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [plainValues, setPlainValues] = useState("");
  const [colours, setColours] = useState<ChoiceDraft[]>([
    { name: "", hex: "", touched: false },
  ]);
  const [error, setError] = useState("");
  const colour = isColourOption(name);
  function update(index: number, change: Partial<ChoiceDraft>) {
    setColours((rows) =>
      rows.map((row, at) => (at === index ? { ...row, ...change } : row)),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: (string | ChoiceInput)[] = [];
    if (colour) {
      for (const row of colours) {
        if (!row.name.trim()) continue;
        const hex = swatchForSave(row.hex);
        if (hex === false) {
          setError(`Enter a valid #RRGGBB swatch for ${row.name}.`);
          return;
        }
        values.push({ value: row.name.trim(), swatch_hex: hex });
      }
    } else {
      values.push(
        ...plainValues
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
    if (!values.length) {
      setError("Add at least one value.");
      return;
    }
    if (await save(name.trim(), values)) {
      setName("");
      setPlainValues("");
      setColours([{ name: "", hex: "", touched: false }]);
      setError("");
    }
  }
  return (
    <form method="post" className="admin-form-grid" onSubmit={submit}>
      <label>
        Option name
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          placeholder="Colour"
          maxLength={100}
        />
      </label>
      {colour ? (
        <div className="admin-colour-rows">
          {colours.map((row, index) => (
            <div className="admin-colour-row" key={index}>
              <label>
                Colour name {index + 1}
                <Input
                  value={row.name}
                  onChange={(event) => {
                    const next = event.target.value;
                    update(index, {
                      name: next,
                      hex: row.touched
                        ? row.hex
                        : (suggestedSwatch(next) ?? ""),
                    });
                    setError("");
                  }}
                  required
                  maxLength={120}
                  placeholder="Forest Green"
                />
              </label>
              <SwatchField
                label={`Swatch for colour ${index + 1}`}
                value={row.hex}
                onChange={(hex) => update(index, { hex, touched: true })}
              />
              {colours.length > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    setColours((rows) => rows.filter((_, at) => at !== index))
                  }
                >
                  Remove colour {index + 1}
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || colours.length >= 50}
            onClick={() =>
              setColours((rows) => [
                ...rows,
                { name: "", hex: "", touched: false },
              ])
            }
          >
            Add another colour
          </Button>
        </div>
      ) : (
        <label>
          Values, separated by commas
          <Input
            value={plainValues}
            onChange={(event) => setPlainValues(event.target.value)}
            required
            placeholder="Green, Orange, Cream"
          />
        </label>
      )}
      {error && <span role="alert">{error}</span>}
      <Button disabled={busy}>Add option</Button>
    </form>
  );
}

export function AddValueForm({
  optionName,
  busy,
  save,
  cancel,
}: {
  optionName: string;
  busy: boolean;
  save: (input: string) => Promise<void>;
  cancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await save(normaliseName(name));
      cancel?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Value could not be added.",
      );
    }
  }
  return (
    <form className="admin-colour-value-form" onSubmit={submit}>
      <label>
        Name
        <Input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
          required
          maxLength={120}
          aria-invalid={!!error}
        />
      </label>
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
      <div className="admin-colour-form-actions">
        {cancel && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={cancel}
          >
            Cancel
          </Button>
        )}
        <Button disabled={busy}>Add {optionName.toLowerCase()} value</Button>
      </div>
    </form>
  );
}
