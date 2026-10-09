/** Deployment setting shared by public metadata and crawl controls. */
export function previewNoindex(): boolean {
  return process.env.PRODUCTION_PREVIEW_NOINDEX === "true";
}
