import { describe, it, expect } from "vitest";
import { nairaToKobo, koboToNaira } from "../src/lib/admin-money";
describe("exact NGN entry", () => {
  it.each([
    ["4500", "450000"],
    ["4500.50", "450050"],
    ["4,500", "450000"],
    ["4,500.50", "450050"],
    ["0", "0"],
    ["0.01", "1"],
    ["9999999999999.99", "999999999999999"],
  ])("converts %s", (input, want) => {
    expect(nairaToKobo(input)).toBe(want);
    expect(nairaToKobo(koboToNaira(want))).toBe(want);
  });
  it.each(["-1", "1.001", "1e3", "NaN", "", "4,50", "01", "10000000000000"])(
    "rejects %s",
    (value) => expect(() => nairaToKobo(value)).toThrow(),
  );
});
