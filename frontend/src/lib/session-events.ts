export type SessionFailure = { status: 401 | 419; path: string };
const eventName = "iranti:session-failure";

export function reportSessionFailure(status: number, path: string): void {
  if ((status === 401 || status === 419) && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SessionFailure>(eventName, { detail: { status, path } }),
    );
  }
}

export function listenForSessionFailures(
  listener: (failure: SessionFailure) => void,
): () => void {
  const receive = (event: Event) =>
    listener((event as CustomEvent<SessionFailure>).detail);
  window.addEventListener(eventName, receive);
  return () => window.removeEventListener(eventName, receive);
}
