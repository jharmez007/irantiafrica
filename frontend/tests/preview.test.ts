import { afterEach, describe, expect, it } from "vitest";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { catalogMetadata } from "../src/lib/catalog-server";

const previous = process.env.PRODUCTION_PREVIEW_NOINDEX;
afterEach(() => {
  if (previous === undefined) delete process.env.PRODUCTION_PREVIEW_NOINDEX;
  else process.env.PRODUCTION_PREVIEW_NOINDEX = previous;
});

describe("production preview crawl policy", () => {
  it("disallows the entire preview and omits its sitemap", async () => {
    process.env.PRODUCTION_PREVIEW_NOINDEX = "true";
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(await sitemap()).toEqual([]);
    expect(
      catalogMetadata("Product", "Description", "/products/example").robots,
    ).toEqual({ index: false, follow: false });
  });

  it("retains indexable public catalog metadata outside the preview", () => {
    process.env.PRODUCTION_PREVIEW_NOINDEX = "false";
    expect(robots().rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(
      catalogMetadata("Product", "Description", "/products/example").robots,
    ).toEqual({ index: true, follow: true });
  });
});
