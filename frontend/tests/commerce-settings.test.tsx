// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { displayTaxLabel } from "../src/lib/business-copy";
import {
  ShippingSettings,
  TaxSettings,
} from "../src/components/admin/commerce-settings";

const mock = vi.hoisted(() => ({
  request: vi.fn(),
  user: {
    authentication_state: "authenticated",
    permissions: ["shipping.configure", "tax.configure"],
  } as { authentication_state: string; permissions: string[] },
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: mock.user, loading: false }),
}));
vi.mock("@/lib/checkout-api", async (original) => ({
  ...(await original<typeof import("../src/lib/checkout-api")>()),
  checkoutRequest: mock.request,
}));
const settings = {
  baseline_id: "85eb715e-7943-4d37-b70a-c9c743628bed",
  current: {
    id: "85eb715e-7943-4d37-b70a-c9c743628bed",
    version_code: "local-uat-commerce-20261014",
    development_only: true,
    payload: {
      rounding: "HALF_UP",
      product_rules: [
        {
          category: "STANDARD",
          label: "Development/UAT STANDARD test treatment",
          rate: "0.1",
        },
      ],
      delivery_tax: {
        taxable: true,
        rate: "0.1",
        label: "Development/UAT delivery tax test rule",
      },
      zones: [
        {
          code: "STANDARD_LAGOS",
          state_code: "LAGOS",
          locality_code: null,
          active: true,
          amount_minor: "500000",
          provider_label: "Merchant delivery",
          service_label: "Standard delivery",
          source_reference: "Owner UAT",
          description: "Standard delivery for this state.",
          estimate: "Arrives soon",
        },
      ],
    },
  },
  states: { LAGOS: "Lagos", FCT: "FCT" },
};
let currentSettings: {
  baseline_id: string | null;
  current: typeof settings.current | null;
  states: typeof settings.states;
} = structuredClone(settings);
const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeEach(() => {
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
  currentSettings = structuredClone(settings);
  mock.request.mockReset();
  mock.user.permissions = ["shipping.configure", "tax.configure"];
  mock.request.mockImplementation(
    async (
      path: string,
      method = "GET",
      body?: { payload: typeof settings.current.payload },
    ) => {
      if (path === "/admin/checkout-configurations/current" && method === "GET")
        return currentSettings;
      if (path === "/admin/checkout-configurations" && method === "POST") {
        currentSettings = {
          ...currentSettings,
          baseline_id: "new-version",
          current: {
            ...(currentSettings.current ?? settings.current),
            id: "new-version",
            payload: body!.payload,
          },
        };
        return { id: "new-version" };
      }
      throw new Error("Unexpected request " + path);
    },
  );
});
afterEach(() => {
  cleanup();
  if (originalShowModal)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      originalShowModal,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose)
    Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
describe("owner commerce settings", () => {
  it("hides settings without both granular permissions", () => {
    mock.user.permissions = ["shipping.configure"];
    render(<ShippingSettings />);
    expect(
      screen.getByText("You do not have access to commerce settings."),
    ).toBeTruthy();
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("shows a retryable load error rather than a permanent loading state", async () => {
    mock.request.mockRejectedValueOnce(
      new Error("Shipping settings unavailable."),
    );
    render(<ShippingSettings />);
    await screen.findByText("Shipping settings unavailable.");
    expect(screen.queryByText("Loading shipping methods…")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading methods" }),
    );
    await screen.findByText("Standard delivery");
  });
  it("shows a distinct loading state while the full method configuration is pending", async () => {
    let finish!: (value: typeof currentSettings) => void;
    mock.request.mockImplementationOnce(
      () =>
        new Promise<typeof currentSettings>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ShippingSettings />);
    expect(screen.getByText("Loading shipping methods…")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Add shipping method",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    finish(currentSettings);
    await screen.findByText("Standard delivery");
  });
  it("distinguishes an empty catalogue from filtered results", async () => {
    currentSettings.current!.payload.zones = [];
    render(<ShippingSettings />);
    await screen.findByText("No shipping methods are configured yet.");
    fireEvent.click(
      screen.getByRole("button", { name: "Create a shipping method" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Add shipping method" }),
    ).toBeTruthy();
  });
  it("combines search, state and status filters across the complete configuration", async () => {
    currentSettings.current!.payload.zones.push({
      ...currentSettings.current!.payload.zones[0],
      code: "EXPRESS_FCT",
      state_code: "FCT",
      service_label: "Express delivery",
      active: false,
      amount_minor: "800000",
    });
    render(<ShippingSettings />);
    await screen.findByText("Express delivery");
    fireEvent.change(screen.getByLabelText("Search methods or locations"), {
      target: { value: "express" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "FCT" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "inactive" },
    });
    expect(screen.getByText("Express delivery")).toBeTruthy();
    expect(screen.queryByText("Standard delivery")).toBeNull();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "active" },
    });
    expect(
      screen.getByText("No shipping methods match your search or filters."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear search and filters" }),
    );
    expect(screen.getByText("Standard delivery")).toBeTruthy();
    expect(screen.getByText("Express delivery")).toBeTruthy();
  });
  it("opens a clean Add modal, retains placeholder guidance, and publishes integer kobo", async () => {
    render(<ShippingSettings />);
    await screen.findByText("Standard delivery");
    expect(
      screen.getByText("Manage delivery methods, locations and charges."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Changes apply to new checkout quotes. Existing orders are unchanged.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Current version:|local-uat-commerce/i),
    ).toBeNull();
    expect(screen.getByText("₦5,000.00")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    const add = screen.getByRole("button", { name: "Add shipping method" });
    fireEvent.click(add);
    const dialog = screen.getByRole("dialog", { name: "Add shipping method" });
    const name = within(dialog).getByLabelText(
      "Method name",
    ) as HTMLInputElement;
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("e.g. Standard Delivery or Express Delivery");
    expect(
      (within(dialog).getByLabelText("State") as HTMLSelectElement).value,
    ).toBe("");
    expect(
      (within(dialog).getByLabelText("Price (₦)") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (within(dialog).getByLabelText("Active") as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.change(name, {
      target: { value: "Express delivery" },
    });
    fireEvent.change(within(dialog).getByLabelText("State"), {
      target: { value: "LAGOS" },
    });
    fireEvent.change(within(dialog).getByLabelText("Price (₦)"), {
      target: { value: "8000.50" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish method" }),
    );
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some(
          (call) =>
            call[0] === "/admin/checkout-configurations" &&
            call[2]?.payload.zones.some(
              (zone: { amount_minor: string; service_label: string }) =>
                zone.amount_minor === "800050" &&
                zone.service_label === "Express delivery",
            ),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Express delivery")).toBeTruthy();
    expect(
      screen.getByText(
        "Changes saved. New checkout quotes will use the updated settings.",
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(add);
  });
  it("creates and edits an Abuja delivery area through immutable publication", async () => {
    render(<ShippingSettings />);
    await screen.findByText("Abuja delivery areas");
    fireEvent.click(screen.getByRole("button", { name: "Add delivery area" }));
    const add = screen.getByRole("dialog", { name: "Add Abuja delivery area" });
    expect(
      (within(add).getByLabelText("Area name") as HTMLInputElement).value,
    ).toBe("");
    expect(
      within(add).getByText("State: Federal Capital Territory"),
    ).toBeTruthy();
    fireEvent.change(within(add).getByLabelText("Area name"), {
      target: { value: " Wuse " },
    });
    fireEvent.change(within(add).getByLabelText("Delivery price (₦)"), {
      target: { value: "8000" },
    });
    fireEvent.click(within(add).getByRole("button", { name: "Add area" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Wuse")).toBeTruthy();
    const firstPost = mock.request.mock.calls.find(
      (call) =>
        call[0] === "/admin/checkout-configurations" && call[1] === "POST",
    )![2];
    expect(firstPost.expected_current_id).toBe(settings.baseline_id);
    expect(firstPost.development_only).toBe(true);
    expect(firstPost.payload.zones.at(-1)).toMatchObject({
      state_code: "FCT",
      locality_code: "WUSE",
      amount_minor: "800000",
    });
    fireEvent.click(
      within(
        screen.getByRole("list", { name: "Abuja delivery areas" }),
      ).getByRole("button", { name: "Edit" }),
    );
    const edit = screen.getByRole("dialog", {
      name: "Edit Abuja delivery area",
    });
    expect(
      (within(edit).getByLabelText("Area name") as HTMLInputElement).value,
    ).toBe("Wuse");
    expect(
      (within(edit).getByLabelText("Delivery price (₦)") as HTMLInputElement)
        .value,
    ).toBe("8000.00");
    fireEvent.change(within(edit).getByLabelText("Delivery price (₦)"), {
      target: { value: "8200" },
    });
    fireEvent.click(within(edit).getByRole("button", { name: "Save area" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("₦8,200.00")).toBeTruthy();
    const posts = mock.request.mock.calls.filter(
      (call) =>
        call[0] === "/admin/checkout-configurations" && call[1] === "POST",
    );
    expect(posts).toHaveLength(2);
    expect(posts[1][2].payload.zones.at(-1).code).toBe(
      firstPost.payload.zones.at(-1).code,
    );
  });
  it("prefills Edit, discards unsaved changes, restores focus, and reopens clean Add", async () => {
    render(<ShippingSettings />);
    await screen.findByText("Standard delivery");
    const edit = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(edit);
    const dialog = screen.getByRole("dialog", { name: "Edit shipping method" });
    expect(
      (within(dialog).getByLabelText("Method name") as HTMLInputElement).value,
    ).toBe("Standard delivery");
    expect(
      (within(dialog).getByLabelText("State") as HTMLSelectElement).value,
    ).toBe("LAGOS");
    expect(
      (within(dialog).getByLabelText("Price (₦)") as HTMLInputElement).value,
    ).toBe("5000.00");
    expect(
      (
        within(dialog).getByLabelText(
          "Description (optional)",
        ) as HTMLInputElement
      ).value,
    ).toBe("Standard delivery for this state.");
    expect(
      (
        within(dialog).getByLabelText(
          "Delivery estimate (optional)",
        ) as HTMLInputElement
      ).value,
    ).toBe("Arrives soon");
    fireEvent.change(within(dialog).getByLabelText("Method name"), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(edit);
    expect(
      mock.request.mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Add shipping method" }),
    );
    expect(
      (
        within(screen.getByRole("dialog")).getByLabelText(
          "Method name",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
  });
  it("clears stale values and errors when opening another method", async () => {
    currentSettings.current!.payload.zones.push({
      ...currentSettings.current!.payload.zones[0],
      code: "EXPRESS_FCT",
      state_code: "FCT",
      service_label: "Express delivery",
      amount_minor: "800000",
      description: "Priority delivery.",
      estimate: "Next day",
    });
    render(<ShippingSettings />);
    const edits = await screen.findAllByRole("button", { name: "Edit" });
    fireEvent.click(edits[0]);
    const first = screen.getByRole("dialog");
    fireEvent.change(within(first).getByLabelText("Price (₦)"), {
      target: { value: "-1" },
    });
    fireEvent.submit(
      within(first)
        .getByRole("button", { name: "Publish method" })
        .closest("form")!,
    );
    expect(within(first).getByText(/non-negative amount/)).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Cancel" }));
    fireEvent.click(edits[1]);
    const second = screen.getByRole("dialog", { name: "Edit shipping method" });
    expect(
      (within(second).getByLabelText("Method name") as HTMLInputElement).value,
    ).toBe("Express delivery");
    expect(
      (within(second).getByLabelText("State") as HTMLSelectElement).value,
    ).toBe("FCT");
    expect(
      (within(second).getByLabelText("Price (₦)") as HTMLInputElement).value,
    ).toBe("8000.00");
    expect(within(second).queryByText(/non-negative amount/)).toBeNull();
  });
  it("publishes an edited method without changing its code, permissions, or environment flag", async () => {
    render(<ShippingSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit shipping method" });
    fireEvent.change(within(dialog).getByLabelText("Method name"), {
      target: { value: "Updated Standard Delivery" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish method" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Updated Standard Delivery")).toBeTruthy();
    const post = mock.request.mock.calls.find(
      (call) =>
        call[0] === "/admin/checkout-configurations" && call[1] === "POST",
    )![2];
    expect(post.expected_current_id).toBe(settings.baseline_id);
    expect(post.development_only).toBe(true);
    expect(post.payload.zones[0].code).toBe("STANDARD_LAGOS");
    expect(post.payload.zones[0].amount_minor).toBe("500000");
  });
  it("dismisses by Escape and returns focus to the trigger", async () => {
    render(<ShippingSettings />);
    const add = await screen.findByRole("button", {
      name: "Add shipping method",
    });
    fireEvent.click(add);
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(add);
  });
  it("keeps validation and publication errors in the modal", async () => {
    render(<ShippingSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add shipping method" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Method name"), {
      target: { value: "Express" },
    });
    fireEvent.change(within(dialog).getByLabelText("State"), {
      target: { value: "LAGOS" },
    });
    fireEvent.change(within(dialog).getByLabelText("Price (₦)"), {
      target: { value: "-1" },
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Publish method" })
        .closest("form")!,
    );
    expect(
      within(dialog).getByText(
        "Enter a non-negative amount with at most two decimal places.",
      ),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Price (₦)"), {
      target: { value: "8000" },
    });
    mock.request.mockImplementationOnce(async () => {
      throw new Error(
        "Configuration changed. Refresh settings before publishing.",
      );
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Publish method" })
        .closest("form")!,
    );
    await within(dialog).findByText(
      "Configuration changed. Refresh settings before publishing.",
    );
    expect(screen.getByRole("dialog")).toBe(dialog);
  });
  it("prevents duplicate submissions while saving and keeps the modal open", async () => {
    let finish!: (value: { id: string }) => void;
    const pending = new Promise<{ id: string }>((resolve) => {
      finish = resolve;
    });
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation(
      (path: string, method = "GET", body?: unknown) =>
        path === "/admin/checkout-configurations" && method === "POST"
          ? pending
          : original(path, method, body),
    );
    render(<ShippingSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add shipping method" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Method name"), {
      target: { value: "Express" },
    });
    fireEvent.change(within(dialog).getByLabelText("State"), {
      target: { value: "LAGOS" },
    });
    fireEvent.change(within(dialog).getByLabelText("Price (₦)"), {
      target: { value: "8000" },
    });
    const form = within(dialog)
      .getByRole("button", { name: "Publish method" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(
      mock.request.mock.calls.filter(
        (call) =>
          call[0] === "/admin/checkout-configurations" && call[1] === "POST",
      ),
    ).toHaveLength(1);
    expect(
      within(dialog)
        .getByRole("button", { name: "Saving method…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.getByRole("dialog")).toBe(dialog);
    finish({ id: "new-version" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("opens a method-specific Deactivate dialog, cancels without a request, and restores focus", async () => {
    render(<ShippingSettings />);
    const more = await screen.findByRole("button", {
      name: "More actions for Standard delivery",
    });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = screen.getByRole("dialog", {
      name: "Deactivate shipping method?",
    });
    expect(within(dialog).getByText("Standard delivery")).toBeTruthy();
    expect(within(dialog).getByText("Lagos")).toBeTruthy();
    expect(within(dialog).getByText("₦5,000.00")).toBeTruthy();
    expect(
      within(dialog).getByText(/You can activate it again later/),
    ).toBeTruthy();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(document.body.style.overflow).toBe("");
    expect(
      mock.request.mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(0);
    expect(document.querySelector(".commerce-confirm")).toBeNull();
  });
  it("opens Archive with the selected locality, dismisses by Escape and keeps the method", async () => {
    Object.assign(currentSettings.current!.payload.zones[0], {
      locality_code: "LEKKI_PHASE_1",
    });
    render(<ShippingSettings />);
    const more = await screen.findByRole("button", {
      name: "More actions for Standard delivery",
    });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = screen.getByRole("dialog", {
      name: "Archive shipping method?",
    });
    expect(within(dialog).getByText("Lagos · LEKKI PHASE 1")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Archive method" }),
    ).toBeTruthy();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(screen.getByText("Standard delivery")).toBeTruthy();
    expect(
      mock.request.mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(0);
  });
  it("keeps failed Deactivate open, then clears its error for a new Archive action", async () => {
    render(<ShippingSettings />);
    const more = await screen.findByRole("button", {
      name: "More actions for Standard delivery",
    });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    mock.request.mockRejectedValueOnce(
      new Error("Configuration changed. Refresh settings before publishing."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deactivate method" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(
      "Configuration changed. Refresh settings before publishing.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(
      within(screen.getByRole("dialog")).queryByText(/Configuration changed/),
    ).toBeNull();
  });
  it("deactivates by stable code, preserves filters, and offers Activate", async () => {
    render(<ShippingSettings />);
    const more = await screen.findByRole("button", {
      name: "More actions for Standard delivery",
    });
    fireEvent.change(screen.getByLabelText("Search methods or locations"), {
      target: { value: "standard" },
    });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate method" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = mock.request.mock.calls.find((call) => call[1] === "POST")![2];
    expect(post.expected_current_id).toBe(settings.baseline_id);
    expect(post.payload.zones[0].code).toBe("STANDARD_LAGOS");
    expect(post.payload.zones[0].active).toBe(false);
    expect(
      (screen.getByLabelText("Search methods or locations") as HTMLInputElement)
        .value,
    ).toBe("standard");
    expect(screen.getByText("Shipping method deactivated.")).toBeTruthy();
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() =>
      expect(screen.getByText("Shipping method activated.")).toBeTruthy(),
    );
    expect(
      mock.request.mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(2);
  });
  it("archives by stable code, updates the list and focuses Add after the row disappears", async () => {
    render(<ShippingSettings />);
    const add = screen.getByRole("button", { name: "Add shipping method" });
    const more = await screen.findByRole("button", {
      name: "More actions for Standard delivery",
    });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive method" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByText("No shipping methods are configured yet."),
    ).toBeTruthy();
    expect(screen.getByText("Shipping method archived.")).toBeTruthy();
    const post = mock.request.mock.calls.find((call) => call[1] === "POST")![2];
    expect(post.payload.zones).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(add));
  });
  it("prevents duplicate Archive requests and blocks dismissal while publishing", async () => {
    let finish!: (value: { id: string }) => void;
    const pending = new Promise<{ id: string }>((resolve) => {
      finish = resolve;
    });
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation(
      (path: string, method = "GET", body?: unknown) =>
        path === "/admin/checkout-configurations" && method === "POST"
          ? pending
          : original(path, method, body),
    );
    render(<ShippingSettings />);
    const more = await screen.findByRole("button", {
      name: "More actions for Standard delivery",
    });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Archive method",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      mock.request.mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(1);
    expect(
      within(dialog)
        .getByRole("button", { name: "Archiving…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.getByRole("dialog")).toBe(dialog);
    finish({ id: "new-version" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("hides fixture labels from business copy without mutating stored tax labels", async () => {
    expect(
      displayTaxLabel("Development/UAT STANDARD test treatment", "STANDARD"),
    ).toBe("Standard");
    render(<TaxSettings />);
    await screen.findByLabelText("Default rate (%)");
    fireEvent.click(screen.getByText("Advanced: manage tax treatments"));
    expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe(
      "Standard",
    );
    expect(
      (
        screen.getByLabelText(
          "Delivery tax treatment label",
        ) as HTMLInputElement
      ).value,
    ).toBe("Delivery tax");
    expect(
      screen.queryByText(
        /Current version:|DEVELOPMENT \/ UAT ONLY|local-uat-commerce/i,
      ),
    ).toBeNull();
  });
  it("offers an accessible tax switch without publishing until Save", async () => {
    render(<TaxSettings />);
    const taxSwitch = await screen.findByRole("switch", {
      name: "Apply tax at checkout",
    });
    expect((taxSwitch as HTMLInputElement).checked).toBe(true);
    fireEvent.click(taxSwitch);
    expect((taxSwitch as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Default rate (%)")).toBeNull();
    expect(
      mock.request.mock.calls.filter(
        (call) =>
          call[0] === "/admin/checkout-configurations" && call[1] === "POST",
      ),
    ).toHaveLength(0);
  });
  it("does not require a delivery label when delivery tax is off", async () => {
    render(<TaxSettings />);
    const label = await screen.findByLabelText("Delivery tax treatment label");
    expect((label as HTMLInputElement).required).toBe(true);
    fireEvent.change(label, { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Taxable delivery"));
    expect(screen.queryByLabelText("Delivery tax treatment label")).toBeNull();
    expect(screen.queryByLabelText("Delivery tax rate (%)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await waitFor(() => {
      const published = mock.request.mock.calls.find(
        (call) =>
          call[0] === "/admin/checkout-configurations" && call[1] === "POST",
      );
      expect(published?.[2]?.payload.delivery_tax).toEqual({
        taxable: false,
        rate: null,
        label: "Development/UAT delivery tax test rule",
      });
    });
    fireEvent.click(screen.getByLabelText("Taxable delivery"));
    expect(
      (
        screen.getByLabelText(
          "Delivery tax treatment label",
        ) as HTMLInputElement
      ).required,
    ).toBe(true);
  });
  it("publishes exact tax fractions and retains the shipping bundle", async () => {
    render(<TaxSettings />);
    await screen.findByLabelText("Default rate (%)");
    fireEvent.change(screen.getByLabelText("Default rate (%)"), {
      target: { value: "7.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some(
          (call) =>
            call[0] === "/admin/checkout-configurations" &&
            call[2]?.payload.product_rules[0].rate === "0.075" &&
            call[2]?.payload.product_rules[0].label ===
              "Development/UAT STANDARD test treatment" &&
            call[2]?.payload.delivery_tax.label ===
              "Development/UAT delivery tax test rule" &&
            call[2]?.payload.zones[0].code === "STANDARD_LAGOS",
        ),
      ).toBe(true),
    );
  });
  it("starts a new configuration with tax off and reveals a simple default rate on enable", async () => {
    currentSettings = {
      ...currentSettings,
      baseline_id: null,
      current: null,
    };
    render(<TaxSettings />);
    await screen.findByText("Tax is currently not applied to orders.");
    expect(screen.queryByLabelText("Default rate (%)")).toBeNull();
    fireEvent.click(screen.getByLabelText("Apply tax at checkout"));
    expect(screen.getByLabelText("Default rate (%)")).toBeTruthy();
    expect(screen.getByLabelText("Default treatment")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Default rate (%)"), {
      target: { value: "7.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some(
          (call) =>
            call[0] === "/admin/checkout-configurations" &&
            call[2]?.payload.tax_enabled === true &&
            call[2]?.payload.default_tax_category === "STANDARD" &&
            call[2]?.payload.product_rules[0].rate === "0.075",
        ),
      ).toBe(true),
    );
  });
  it("publishes a new tax-off configuration without requiring a treatment", async () => {
    currentSettings = {
      ...currentSettings,
      baseline_id: null,
      current: null,
    };
    render(<TaxSettings />);
    await screen.findByText("Tax is currently not applied to orders.");
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some(
          (call) =>
            call[0] === "/admin/checkout-configurations" &&
            call[2]?.payload.tax_enabled === false &&
            call[2]?.payload.product_rules.length === 0,
        ),
      ).toBe(true),
    );
  });
});
