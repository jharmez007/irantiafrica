/** Deliberately small V1 convention; option names are not a general taxonomy. */
export function isColourOption(name: string): boolean {
  return /^(colou?r|colou?rway)$/i.test(name.trim());
}

const commonColours: Record<string, string> = {
  black: "#111111",
  white: "#FFFFFF",
  ivory: "#F4EEE1",
  cream: "#F3EBDD",
  "forest green": "#335438",
  green: "#2F6B3D",
  navy: "#1F2A44",
  blue: "#3E6FA5",
  red: "#A33A32",
  terracotta: "#B85A22",
  cognac: "#A65A32",
  brown: "#7A4A2E",
  beige: "#D8C8AE",
  grey: "#8A8A8A",
  gray: "#8A8A8A",
  charcoal: "#3C4142",
};

export function normalizeSwatchHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

export function suggestedSwatch(name: string): string | null {
  return commonColours[name.trim().toLowerCase()] ?? null;
}

export function resolveSwatch(value: {
  value: string;
  swatch_hex?: string | null;
}): string | null {
  return normalizeSwatchHex(value.swatch_hex) ?? suggestedSwatch(value.value);
}
