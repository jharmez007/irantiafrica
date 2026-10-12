// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogList } from "../src/components/catalog/catalog-list";
import { ContactForm } from "../src/components/contact/contact-form";
import { Footer } from "../src/components/brand/footer";
import ContactPage from "../src/app/contact/page";
import { toast } from "../src/lib/toast";

beforeEach(() => {
  document.cookie = "XSRF-TOKEN=contact-test-token";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("customer storefront refinements", () => {
  it("keeps concise catalog controls visibly clean and semantically labelled", () => {
    render(
      <CatalogList
        result={{ data: [], meta: { page: 1, last_page: 1, total: 0 } }}
        categories={[
          {
            id: "c",
            slug: "baskets-storage",
            name: "Baskets & storage",
            status: "active",
          },
        ]}
        params={new URLSearchParams()}
        path="/categories/baskets-storage"
        title="Baskets & storage"
      />,
    );
    const search = screen.getByRole("searchbox", { name: "Search products" });
    expect(search.getAttribute("placeholder")).toBe("Search products");
    expect(screen.getByRole("combobox", { name: "Category" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Sort" })).toBeTruthy();
    for (const label of ["Search products", "Category", "Sort"]) {
      expect(
        screen
          .getByText(label, { selector: "label" })
          .classList.contains("sr-only"),
      ).toBe(true);
    }
    const form = search.closest("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/products");
    expect(
      within(form).getByRole("button", { name: "Apply filters" }),
    ).toBeTruthy();
  });

  it("renders the contact route and footer destination without publishing the private recipient", () => {
    render(<ContactPage />);
    expect(
      screen.getByRole("heading", { name: "We'd love to hear from you." }),
    ).toBeTruthy();
    for (const name of [
      "Name",
      "Email",
      "Phone number (optional)",
      "Subject",
      "Message",
    ]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    expect(document.body.textContent).not.toMatch(
      /[A-Z0-9._%+-]+@irantiafrica\.com/i,
    );
    cleanup();
    render(<Footer />);
    expect(
      screen.getByRole("link", { name: "Contact" }).getAttribute("href"),
    ).toBe("/contact");
  });

  it("submits through the CSRF-protected API and confirms success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetch);
    const success = vi.spyOn(toast, "success");
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Name"), "Ada Okafor");
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Subject"), "A basket question");
    await user.type(
      screen.getByLabelText("Message"),
      "Can you help me find this basket?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Message sent"),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe("/sanctum/csrf-cookie");
    expect(fetch.mock.calls[1][0]).toBe("/api/v1/contact");
    const request = fetch.mock.calls[1][1] as RequestInit;
    expect(request.credentials).toBe("include");
    expect((request.headers as Record<string, string>)["X-XSRF-TOKEN"]).toBe(
      "contact-test-token",
    );
    expect(JSON.parse(request.body as string)).toMatchObject({
      name: "Ada Okafor",
      subject: "A basket question",
    });
    expect(success).toHaveBeenCalledWith("Message sent", expect.any(String));
  });

  it("associates server validation with fields and offers a useful failure message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({
            error: { fields: { email: ["Enter a valid email address."] } },
          }),
        }),
    );
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Name"), "Ada Okafor");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Subject"), "A basket question");
    await user.type(
      screen.getByLabelText("Message"),
      "Can you help me find this basket?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(screen.getByText("Enter a valid email address.")).toBeTruthy(),
    );
    const email = screen.getByLabelText("Email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("contact-email-error");
    expect(
      screen.getByText("Please check the highlighted fields."),
    ).toBeTruthy();
  });
});
