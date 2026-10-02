"use client";

import { useEffect, useState, type ReactNode } from "react";
import { listenForToasts, type ToastInput } from "@/lib/toast";

type ToastRecord = ToastInput & { id: number };
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  useEffect(
    () =>
      listenForToasts((input) => {
        setItems((current) => {
          if (
            current.some(
              (item) =>
                item.tone === input.tone &&
                item.title === input.title &&
                item.description === input.description,
            )
          )
            return current;
          return [...current.slice(-3), { ...input, id: ++nextId }];
        });
      }),
    [],
  );
  useEffect(() => {
    if (!items.length) return;
    const timers = items.map((item) =>
      window.setTimeout(
        () => {
          setItems((current) =>
            current.filter((entry) => entry.id !== item.id),
          );
        },
        item.tone === "error" ? 8000 : 5000,
      ),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [items]);
  return (
    <>
      {children}
      <div className="toast-stack" aria-label="Notifications">
        {items.map((item) => (
          <div
            key={item.id}
            className={`app-toast app-toast--${item.tone}`}
            role={item.tone === "error" ? "alert" : "status"}
            aria-live={item.tone === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <span className="app-toast-icon" aria-hidden="true">
              {item.tone === "success"
                ? "✓"
                : item.tone === "error"
                  ? "!"
                  : item.tone === "warning"
                    ? "!"
                    : "i"}
            </span>
            <div className="app-toast-copy">
              <strong>{item.title}</strong>
              {item.description && <p>{item.description}</p>}
            </div>
            <button
              type="button"
              aria-label={`Dismiss ${item.title}`}
              onClick={() =>
                setItems((current) =>
                  current.filter((entry) => entry.id !== item.id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
