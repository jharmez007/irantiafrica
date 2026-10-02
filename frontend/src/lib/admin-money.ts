/** Exact decimal conversion: no floating-point money arithmetic. */
export function nairaToKobo(input: string): string {
  const value = input.trim();
  if (
    !/^(0|[1-9][0-9]*|[1-9][0-9]{0,2}(,[0-9]{3})+)(\.[0-9]{1,2})?$/.test(value)
  )
    throw new Error("Enter a naira amount with at most two decimal places.");
  const [whole, fraction = ""] = value.replaceAll(",", "").split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > 999999999999999n)
    throw new Error("Price exceeds the supported amount.");
  return minor.toString();
}
export function koboToNaira(input: string): string {
  const amount = BigInt(input);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}
