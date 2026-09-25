// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Alert,
  Checkbox,
  Drawer,
  FormField,
  Modal,
  PasswordInput,
} from "../src/components/ui";

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
function DialogExample({ drawer = false }: { drawer?: boolean }) {
  const [open, setOpen] = useState(false);
  const Component = drawer ? Drawer : Modal;
  return (
    <>
      <button onClick={() => setOpen(true)}>Open preferences</button>
      <Component open={open} onClose={() => setOpen(false)} title="Preferences">
        <p>Your preferences.</p>
      </Component>
    </>
  );
}
describe("shared accessible UI controls", () => {
  it("lets keyboard users reveal a labelled password without submitting its form", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={submit}>
        <FormField label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </FormField>
      </form>,
    );
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    await user.type(input, "A private passphrase");
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show password" }),
    );
    await user.keyboard("{Enter}");
    expect(input.type).toBe("text");
    expect(
      screen
        .getByRole("button", { name: "Hide password" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(submit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(input.type).toBe("password");
    expect(input.value).toBe("A private passphrase");
  });
  it("handles the native modal cancel event and restores its trigger focus", async () => {
    const user = userEvent.setup();
    render(<DialogExample />);
    const trigger = screen.getByRole("button", { name: "Open preferences" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Preferences",
    }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
  it("provides a named drawer close control and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<DialogExample drawer />);
    const trigger = screen.getByRole("button", { name: "Open preferences" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Preferences",
    }) as HTMLDialogElement;
    await user.click(screen.getByRole("button", { name: "Close preferences" }));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
  it("announces errors and success without depending on color alone", () => {
    render(
      <>
        <Alert tone="error" title="Please review">
          The email is required.
        </Alert>
        <Alert tone="success">Your changes were saved.</Alert>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The email is required.",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Your changes were saved.",
    );
    expect(
      screen.getByRole("alert").querySelector("[aria-hidden=true]"),
    ).toBeTruthy();
  });
  it("keeps checkbox labels and native keyboard interaction", async () => {
    const user = userEvent.setup();
    render(
      <label>
        <Checkbox name="choice" />
        Use a recovery code
      </label>,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Use a recovery code",
    }) as HTMLInputElement;
    await user.tab();
    expect(document.activeElement).toBe(checkbox);
    await user.keyboard(" ");
    expect(checkbox.checked).toBe(true);
  });
});

it("associates field hints while retaining an existing error description", () => {
  render(
    <>
      <FormField
        label="Password"
        htmlFor="hint-password"
        hint="Use a unique passphrase."
      >
        <PasswordInput id="hint-password" aria-describedby="password-error" />
      </FormField>
      <p id="password-error">Please check your password.</p>
    </>,
  );
  expect(
    screen.getByLabelText("Password").getAttribute("aria-describedby"),
  ).toBe("password-error hint-password-hint");
  expect(document.getElementById("hint-password-hint")?.textContent).toBe(
    "Use a unique passphrase.",
  );
});
