/** Presentation aliases for the two known local fixture labels; stored values stay intact. */
export function displayTaxLabel(label: string, category?: string): string {
  if (
    label === "Development/UAT STANDARD test treatment" &&
    category === "STANDARD"
  )
    return "Standard";
  if (label === "Development/UAT delivery tax test rule") return "Delivery tax";
  return label;
}
