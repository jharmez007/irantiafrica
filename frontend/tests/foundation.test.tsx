import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import HomePage from "../src/app/page";
import NotFound from "../src/app/not-found";
import { catalogFetch } from "../src/lib/catalog-server";
vi.mock("../src/lib/catalog-server", () => ({ catalogFetch: vi.fn() }));
async function renderHome(): Promise<string> {
  let html = "";
  await new Promise<void>((resolve, reject) => {
    const stream = renderToPipeableStream(<HomePage />, {
      onAllReady() {
        const sink = new Writable({
          write(chunk, _encoding, done) {
            html += chunk.toString();
            done();
          },
        });
        sink.on("finish", resolve);
        sink.on("error", reject);
        stream.pipe(sink);
      },
      onError: reject,
    });
  });
  return html;
}
describe("brand homepage", () => {
  it("keeps brand navigation useful when the catalog is unavailable", async () => {
    vi.mocked(catalogFetch).mockRejectedValue(new Error("unavailable"));
    const html = await renderHome();
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Memories");
    expect(html).toContain('href="/products"');
    expect(html).toContain("The collection will be back soon.");
    expect(html).not.toContain("/api/v1/health");
    expect(html).not.toContain("Engineering foundation");
    expect(html).not.toContain("Add to cart");
  });
  it("renders actual category names and links without fabricating empty catalog products", async () => {
    vi.mocked(catalogFetch).mockImplementation(async (path) =>
      path.startsWith("/categories")
        ? {
            data: [{ name: "Textiles", slug: "textiles" }],
            meta: { page: 1, last_page: 1, total: 1 },
          }
        : { data: [], meta: { page: 1, last_page: 1, total: 0 } },
    );
    const html = await renderHome();
    expect(html).toContain("Textiles");
    expect(html).toContain('href="/categories/textiles"');
    expect(html).toContain("A new collection awaits.");
  });
  it("provides a recovery link for an unknown route", () => {
    expect(renderToStaticMarkup(<NotFound />)).toContain('href="/"');
  });
  it("streams a neutral shell until the browser can distinguish section links", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("home-loading--section");
    expect(html).not.toContain("app-screen-loader");
    expect(html).not.toContain("page-skeleton--home");
  });
});
