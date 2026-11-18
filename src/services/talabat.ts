import logger from "../logger";

export interface TalabatMenu {
  url: string;
  restaurant: string;
  branch: string;
  deliveryFee: number;
  minimumOrder: number;
  items: { name: string; price: number; section: string }[];
}

// The model picks the URL, so only Talabat Egypt restaurant pages may be fetched.
const MENU_URL = /^https:\/\/(?:www\.)?talabat\.com\/(?:ar\/)?egypt\/restaurant\/(\d+)\/([a-z0-9-]+)/i;

export function talabatBranchId(url: string): string | null {
  return MENU_URL.exec(url)?.[1] ?? null;
}

// The Arabic page gives Arabic item names, which match how people order.
// Without an area id Talabat redirects to its home page; any id works, because
// the menu belongs to the branch, not the area.
function arabicUrl(url: string): string {
  const m = MENU_URL.exec(url)!;
  const aid = new URL(url).searchParams.get("aid") || "1";
  return `https://www.talabat.com/ar/egypt/restaurant/${m[1]}/${m[2]}?aid=${aid}`;
}

export async function fetchTalabatMenu(url: string): Promise<TalabatMenu> {
  if (!MENU_URL.test(url)) throw new Error("Not a Talabat Egypt restaurant URL");
  const target = arabicUrl(url);

  const res = await fetch(target, {
    redirect: "manual",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "ar,en;q=0.8",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 200) throw new Error(`Talabat returned ${res.status}`);

  const html = await res.text();
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) throw new Error("Talabat page has no menu data");

  const state = JSON.parse(json)?.props?.pageProps?.initialMenuState;
  const r = state?.restaurant;
  const items = state?.menuData?.items;
  if (!r || !Array.isArray(items) || !items.length) throw new Error("Talabat page has no menu items");

  const menu: TalabatMenu = {
    url: target,
    restaurant: r.name,
    branch: r.branchName ?? "",
    deliveryFee: Number(r.deliveryFee) || 0,
    minimumOrder: Number(r.minimumOrderAmount) || 0,
    items: items
      .filter((i: { price?: number }) => typeof i.price === "number" && i.price > 0)
      .map((i: { name: string; price: number; sectionName?: string }) => ({
        name: i.name.trim(),
        price: i.price,
        section: i.sectionName ?? "",
      })),
  };
  logger.info("Fetched Talabat menu", { url: target, items: menu.items.length });
  return menu;
}
