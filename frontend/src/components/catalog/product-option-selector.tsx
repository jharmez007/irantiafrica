import { optionAvailable, type Product } from "@/lib/catalog";
import { Select } from "@/components/ui";
import { isColourOption, resolveSwatch } from "@/lib/colour-swatches";

export function ProductOptionSelector({
  product,
  option,
  selection,
  onChange,
}: {
  product: Product;
  option: Product["options"][number];
  selection: Record<string, string>;
  onChange: (valueId: string) => void;
}) {
  const colour = isColourOption(option.name);
  const chips = colour || option.values.length <= 8;
  const selectedValue = option.values.find(
    (value) => value.id === selection[option.id],
  );
  return (
    <fieldset className="product-option">
      <legend>
        {option.name}
        {colour && selectedValue ? ` — ${selectedValue.value}` : ""}
      </legend>
      {chips ? (
        <div className="product-option-choices">
          {option.values.map((value) => {
            const available = optionAvailable(product, value.id);
            const swatch = colour ? resolveSwatch(value) : null;
            return (
              <button
                key={value.id}
                type="button"
                className="product-option-chip"
                aria-pressed={selection[option.id] === value.id}
                disabled={!available}
                onClick={() => onChange(value.id)}
              >
                {swatch && (
                  <span
                    className="product-colour-swatch"
                    style={{ backgroundColor: swatch }}
                    aria-hidden="true"
                  />
                )}
                <span>{value.value}</span>
                {!available && (
                  <span className="product-option-unavailable">Sold out</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <label className="sr-only" htmlFor={`option-${option.id}`}>
            Choose {option.name}
          </label>
          <Select
            id={`option-${option.id}`}
            value={selection[option.id] ?? ""}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Choose {option.name}</option>
            {option.values.map((value) => {
              const available = optionAvailable(product, value.id);
              return (
                <option key={value.id} value={value.id} disabled={!available}>
                  {value.value}
                  {available ? "" : " — sold out"}
                </option>
              );
            })}
          </Select>
        </>
      )}
    </fieldset>
  );
}
