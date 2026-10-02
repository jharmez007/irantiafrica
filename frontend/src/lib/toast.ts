export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastInput = {
  tone: ToastTone;
  title: string;
  description?: string;
};

const eventName = "iranti:toast";

export function publishToast(input: ToastInput): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ToastInput>(eventName, { detail: input }),
    );
  }
}

export const toast = {
  success: (title: string, description?: string) =>
    publishToast({ tone: "success", title, description }),
  error: (title: string, description?: string) =>
    publishToast({ tone: "error", title, description }),
  warning: (title: string, description?: string) =>
    publishToast({ tone: "warning", title, description }),
  info: (title: string, description?: string) =>
    publishToast({ tone: "info", title, description }),
};

export function listenForToasts(
  listener: (input: ToastInput) => void,
): () => void {
  const receive = (event: Event) =>
    listener((event as CustomEvent<ToastInput>).detail);
  window.addEventListener(eventName, receive);
  return () => window.removeEventListener(eventName, receive);
}
