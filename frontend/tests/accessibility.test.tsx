// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AuthForm } from "../src/components/auth-form";
import { CatalogList } from "../src/components/catalog/catalog-list";
import { Modal } from "../src/components/ui";
import type { Product } from "../src/lib/catalog";

// Reuse the axe-core engine already locked through eslint-plugin-jsx-a11y.
// No production dependency or download is introduced by this test.
const require = createRequire(import.meta.url);
const axe = require(require.resolve("axe-core")) as {
  run: (
    context: HTMLElement,
    options: {
      runOnly: { type: "tag"; values: string[] };
      rules: Record<string, { enabled: boolean }>;
    },
  ) => Promise<{
    violations: {
      id: string;
      impact: string | null;
      nodes: { target: string[]; failureSummary?: string }[];
    }[];
  }>;
};
const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/login",
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    error: "",
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "IRANTI Africa — accessibility fixture";
});
afterEach(cleanup);
async function scan() {
  const result = await axe.run(document.body, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    // jsdom has no rendered layout or computed pixel colors; assess contrast in visual QA.
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes })),
  ).toEqual([]);
}
describe("axe accessibility checks using existing tooling", () => {
  it.each(["login", "register"] as const)(
    "finds no detectable WCAG violations on the %s form",
    async (mode) => {
      render(<AuthForm mode={mode} />);
      await scan();
    },
  );
  it("checks catalog filters, product links, image alternatives and pagination", async () => {
    const product: Product = {
      slug: "accessibility-fixture",
      name: "Textile fixture",
      description: "Test fixture only.",
      kind: "simple",
      available: true,
      currency: "NGN",
      price_min_minor: "12000",
      price_max_minor: "12000",
      categories: [{ name: "Textiles", slug: "textiles" }],
      options: [],
      variants: [
        {
          id: "variant",
          available: true,
          sku: "FIXTURE-1",
          unit_price_minor: "12000",
          currency: "NGN",
          option_value_ids: [],
        },
      ],
      media: [
        {
          id: "image",
          variant_id: null,
          alt_text: "Textile test fixture",
          position: 0,
          width: 640,
          height: 480,
          sources: [{ url: "/fixture.webp", width: 640, height: 480 }],
        },
      ],
    };
    render(
      <main>
        <CatalogList
          result={{
            data: [product],
            meta: { page: 1, last_page: 2, total: 25 },
          }}
          categories={product.categories}
          params={new URLSearchParams()}
        />
      </main>,
    );
    await scan();
  });
  it("checks the named open dialog and labelled close control", async () => {
    const show = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "showModal",
    );
    const close = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "close",
    );
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
    try {
      render(
        <main>
          <h1>Dialog fixture</h1>
          <Modal open onClose={() => {}} title="Preferences">
            <p>Review your preferences.</p>
          </Modal>
        </main>,
      );
      await scan();
    } finally {
      cleanup();
      if (show)
        Object.defineProperty(HTMLDialogElement.prototype, "showModal", show);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
      if (close)
        Object.defineProperty(HTMLDialogElement.prototype, "close", close);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    }
  });
});
