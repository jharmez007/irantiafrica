// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  AppScreenLoader,
  PageSkeleton,
  ProductGridSkeleton,
} from "../src/components/loading";
import { Button } from "../src/components/ui";
import { HomeLoadingFallback } from "../src/components/home-loading-fallback";
import InventoryLoading from "../src/app/admin/inventory/loading";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("shared loading states", () => {
  it("announces the branded screen wait with a decorative mark", () => {
    render(<AppScreenLoader label="Preparing your workspace…" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("IRANTI AFRICA");
    expect(status.textContent).toContain("Preparing your workspace…");
    expect(screen.getByAltText("").getAttribute("src")).toContain(
      "favicon-original",
    );
  });

  it("uses labelled skeletons for catalog and admin waits", () => {
    const view = render(<ProductGridSkeleton count={4} />);
    expect(
      view.container.querySelectorAll(".product-card-skeleton"),
    ).toHaveLength(4);
    view.rerender(<InventoryLoading />);
    expect(
      screen.getByRole("status", { name: "Loading inventory" }),
    ).toBeTruthy();
    expect(view.container.querySelectorAll(".loading-table-row")).toHaveLength(
      5,
    );
    view.rerender(
      <PageSkeleton kind="detail" label="Loading product details" />,
    );
    expect(
      screen.getByRole("status", { name: "Loading product details" }),
    ).toBeTruthy();
    expect(view.container.querySelector(".loading-detail-image")).toBeTruthy();
    view.rerender(
      <PageSkeleton
        kind="checkout"
        label="Loading checkout"
        showHeading={false}
      />,
    );
    expect(view.container.querySelector(".page-skeleton-heading")).toBeNull();
  });

  it("disables a pending action and keeps its purpose in the visible label", () => {
    const action = vi.fn();
    const view = render(<Button onClick={action}>Save changes</Button>);
    view.rerender(
      <Button onClick={action} loading loadingLabel="Saving…">
        Save changes
      </Button>,
    );
    const button = screen.getByRole("button", {
      name: "Saving…",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".loading-spinner")).toBeTruthy();
    fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
  });

  it("shows no loading UI for home section navigation", () => {
    window.location.hash = "#collections";
    const view = render(<HomeLoadingFallback />);
    expect(view.container.querySelector(".home-loading--section")).toBeTruthy();
    expect(view.container.querySelector(".page-skeleton")).toBeNull();
    expect(view.container.querySelector(".app-screen-loader")).toBeNull();
    expect(screen.queryByText("Preparing your experience…")).toBeNull();
  });

  it("keeps the branded loader for a normal home load", () => {
    render(<HomeLoadingFallback />);
    expect(screen.getByRole("status").textContent).toContain(
      "Preparing your experience…",
    );
  });
});
