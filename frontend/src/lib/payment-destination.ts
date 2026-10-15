export function trustedPaystackUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.paystack.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("The payment destination could not be verified.");
  return url.href;
}

export function navigateToPaystack(value: string): void {
  window.location.assign(trustedPaystackUrl(value));
}
