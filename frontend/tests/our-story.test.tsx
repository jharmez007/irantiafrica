// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import OurStoryPage, { metadata } from "../src/app/our-story/page";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // The image URLs and accessible descriptions matter here; Next handles sizing.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

afterEach(cleanup);

describe("Our Story page", () => {
  it("renders the approved story in semantic sections", () => {
    render(<OurStoryPage />);
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", {
        level: 1,
        name: "A Piece of Nigeria, Wherever You Go.",
      }),
    ).toBeTruthy();
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const heading of [
      "A memory worth keeping.",
      "Made closer to home.",
      "Celebrating Nigerian creativity.",
      "Something worth remembering.",
      "IRANTI AFRICA — Taking a piece of Nigeria with you, wherever life takes you.",
    ]) {
      expect(within(main).getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(
      within(main).getByText(
        /IRANTI AFRICA is a Nigerian owned souvenir brand/,
      ),
    ).toBeTruthy();
    expect(within(main).getByText(/means “memory” in Yoruba/)).toBeTruthy();
    expect(
      within(main).getByText(
        /We collaborate with local artisans and Nigerian owned businesses/,
      ),
    ).toBeTruthy();
    expect(
      within(main).getByText(
        /Our mission is to make Nigerian souvenirs more accessible/,
      ),
    ).toBeTruthy();
    expect(
      within(main).getByText(
        /Whether you are a visitor discovering Nigeria for the first time/,
      ),
    ).toBeTruthy();
    expect(
      within(main).getAllByRole("link", { name: /Explore the collection/ }),
    ).toHaveLength(2);
    expect(within(main).getAllByRole("img")).toHaveLength(2);
    expect(
      within(main)
        .getAllByRole("img")
        .every((image) => Boolean(image.getAttribute("alt"))),
    ).toBe(true);
  });

  it("sets route-specific, approved metadata", () => {
    expect(metadata.title).toEqual({ absolute: "Our Story | IRANTI Africa" });
    expect(metadata.description).toContain("Nigerian artisans and businesses");
  });
});
