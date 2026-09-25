"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
export function PasswordInput({
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`input ${className}`}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};
function Dialog({
  open,
  onClose,
  title,
  children,
  drawer = false,
}: DialogProps & { drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={drawer ? "dialog drawer" : "dialog modal"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Modal(props: DialogProps) {
  return <Dialog {...props} />;
}
export function Drawer(props: DialogProps) {
  return <Dialog {...props} drawer />;
}
