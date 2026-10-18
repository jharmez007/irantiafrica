// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { HomeHero, heroSlides } from "../src/components/brand/home-hero";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
    onLoad,
    onError,
    preload,
  }: {
    src: string;
    alt: string;
    className?: string;
    onLoad?: () => void;
    onError?: () => void;
    preload?: boolean;
  }) => (
    // Test the image lifecycle; Next's responsive optimizer runs in the build.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      data-preload={preload}
      onLoad={onLoad}
      onError={onError}
    />
  ),
}));

let reduced = false;
let hidden = false;
const originalMatchMedia = window.matchMedia;
const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");

beforeEach(() => {
  reduced = false;
  hidden = false;
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && reduced,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
  else Reflect.deleteProperty(document, "hidden");
});

function images() {
  return Array.from(
    document.querySelectorAll<HTMLImageElement>(".campaign-visual img"),
  );
}

function completeFade() {
  fireEvent.load(images()[1]);
  fireEvent.transitionEnd(images()[1].parentElement as HTMLElement, {
    propertyName: "opacity",
  });
}

describe("homepage campaign hero", () => {
  it("renders the first campaign and only its decorative image in the server frame", () => {
    const html = renderToString(<HomeHero />);
    expect(html).toContain("A little closer to home.");
    expect(html).toContain("Explore the collection");
    expect(html).toContain("/assets/hero/home-vignette.webp");
    expect(html).not.toContain("/assets/hero/woven-baskets.webp");

    render(<HomeHero />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(images()).toHaveLength(1);
    expect(images()[0].getAttribute("data-preload")).toBe("true");
    expect(images()[0].getAttribute("alt")).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("configures four distinct stories with the approved copy, destinations, and focal points", () => {
    expect(heroSlides).toHaveLength(4);
    expect(heroSlides.map((slide) => slide.href)).toEqual([
      "/products",
      "/our-story",
      "/categories/home-decor",
      "/categories/gift-sets",
    ]);
    expect(heroSlides.map((slide) => slide.title)).toEqual([
      "A little closer to home.",
      "Made with meaning.",
      "Bring a piece of Nigeria into everyday life.",
      "Gifts that carry a story.",
    ]);
    expect(
      heroSlides.every(
        (slide) => slide.desktopPosition && slide.mobilePosition,
      ),
    ).toBe(true);
  });

  it("autoplays after seven seconds and crossfades only after the next image loads", () => {
    render(<HomeHero />);
    act(() => vi.advanceTimersByTime(6999));
    expect(images()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(images()).toHaveLength(2);
    expect(images()[1].getAttribute("data-preload")).not.toBe("true");
    expect(images()[1].getAttribute("src")).toBe(heroSlides[1].image);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[0].title,
    );
    completeFade();
    expect(images()).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[1].title,
    );
    expect(
      screen
        .getByRole("link", { name: "Discover the craft" })
        .getAttribute("href"),
    ).toBe("/our-story");
  });

  it("navigates with labelled arrows and dots, keeping a single heading", () => {
    render(<HomeHero />);
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    completeFade();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[1].title,
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous story" }));
    completeFade();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[0].title,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Show story 4: ${heroSlides[3].title}`,
      }),
    );
    completeFade();
    expect(
      screen.getByRole("link", { name: "Find a gift" }).getAttribute("href"),
    ).toBe("/categories/gift-sets");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: `Show story 4: ${heroSlides[3].title}` })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  it("keeps the gift CTA on the requested Gift sets category", () => {
    render(<HomeHero availableCategorySlugs={["gift-sets"]} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Show story 4: ${heroSlides[3].title}`,
      }),
    );
    completeFade();
    expect(
      screen.getByRole("link", { name: "Find a gift" }).getAttribute("href"),
    ).toBe("/categories/gift-sets");
  });

  it("sends an unpublished home category to the full collection", () => {
    render(<HomeHero availableCategorySlugs={["gift-sets"]} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Show story 3: ${heroSlides[2].title}`,
      }),
    );
    completeFade();
    expect(
      screen
        .getByRole("link", { name: "Shop home & living" })
        .getAttribute("href"),
    ).toBe("/products");
  });

  it("ignores a repeated selection and lets the current dot cancel a pending change", () => {
    render(<HomeHero />);
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    expect(images()).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Show story 1: ${heroSlides[0].title}`,
      }),
    );
    expect(images()).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[0].title,
    );
  });

  it("pauses on hover, focus, or a hidden tab, then resumes the remaining interval", () => {
    render(<HomeHero />);
    const hero = document.querySelector(".home-hero") as HTMLElement;
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(hero);
    act(() => vi.advanceTimersByTime(10000));
    expect(images()).toHaveLength(1);
    fireEvent.mouseLeave(hero);
    act(() => vi.advanceTimersByTime(4000));
    expect(images()).toHaveLength(2);
    completeFade();
    fireEvent.focus(screen.getByRole("button", { name: "Next story" }));
    act(() => vi.advanceTimersByTime(10000));
    expect(images()).toHaveLength(1);
    fireEvent.blur(screen.getByRole("button", { name: "Next story" }));
    hidden = true;
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(10000));
    expect(images()).toHaveLength(1);
  });

  it("stops autoplay but still allows instant manual navigation with reduced motion", () => {
    reduced = true;
    render(<HomeHero />);
    act(() => vi.advanceTimersByTime(30000));
    expect(images()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    expect(images()).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[1].title,
    );
  });

  it("keeps the visible slide and copy when a later image fails", () => {
    render(<HomeHero />);
    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    fireEvent.error(images()[1]);
    expect(images()).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      heroSlides[0].title,
    );
  });
});
