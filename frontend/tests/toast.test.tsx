// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../src/components/toast-provider";
import { toast } from "../src/lib/toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("announces all four tones, stacks them and suppresses active duplicates", async () => {
  render(
    <ToastProvider>
      <button>Work control</button>
      <p>Page content</p>
    </ToastProvider>,
  );
  screen.getByRole("button", { name: "Work control" }).focus();
  act(() => {
    toast.success("Saved");
    toast.error("Could not save", "Review the form.");
    toast.warning("Check stock");
    toast.info("Processing");
    toast.success("Saved");
  });
  expect(screen.getAllByRole("status")).toHaveLength(3);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
  expect(screen.getAllByRole("status")[0].getAttribute("aria-live")).toBe(
    "polite",
  );
  expect(screen.getAllByRole("button", { name: /^Dismiss/ })).toHaveLength(4);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Work control" }),
  );
  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Dismiss Saved" }),
  );
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByText("Saved")).toBeNull();
  expect(screen.getByText("Page content")).toBeTruthy();
});

it("automatically dismisses non-error feedback", () => {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <p>Page content</p>
    </ToastProvider>,
  );
  act(() => toast.info("Please wait"));
  expect(screen.getByText("Please wait")).toBeTruthy();
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.queryByText("Please wait")).toBeNull();
});
