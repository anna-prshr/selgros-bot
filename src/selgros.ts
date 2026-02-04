import { chromium, Browser, Page } from "playwright";

type SelgrosProduct = {
  name: string;
  price?: string;
  url?: string;
};

const SHOP_URL = "https://www.selgros.de/shop/products";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function ensureInShop(page: Page) {
  await page.goto(SHOP_URL, { waitUntil: "domcontentloaded" });

  // Wenn wir auf b2clogin.com landen, sind wir NICHT eingeloggt.
  if (page.url().includes("b2clogin.com")) {
    await doLogin(page);
  }

  // Nach Login nochmal in den Shop
  await page.goto(SHOP_URL, { waitUntil: "domcontentloaded" });

  // Wenn wir immer noch nicht im Shop sind -> sauber abbrechen
  if (!page.url().includes("/shop/")) {
    throw new Error(`Login failed or blocked. Current URL: ${page.url()}`);
  }
}

async function doLogin(page: Page) {
  const username = requireEnv("SELGROS_USERNAME");
  const password = requireEnv("SELGROS_PASSWORD");

  // Wir sind bereits auf der Azure Login Seite.
  // 1) Username/Email
  const userInput = page
    .locator('input[type="email"], input[name="loginfmt"], input[autocomplete="username"]')
    .first();

  await userInput.waitFor({ state: "visible", timeout: 60000 });
  await userInput.fill(username);

  // Next/Continue (falls vorhanden)
  const nextBtn = page.getByRole("button", { name: /weiter|next|continue/i }).first();
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click();
  }

  // 2) Password
  const passInput = page.locator('input[type="password"], input[name="passwd"]').first();
  await passInput.waitFor({ state: "visible", timeout: 60000 });
  await passInput.fill(password);

  const signInBtn = page.getByRole("button", { name: /anmelden|login|sign in/i }).first();
  await signInBtn.click();

  // Warten, bis Redirects fertig sind (max 90 Sekunden)
  await page.waitForTimeout(2000);
  await page.waitForLoadState("domcontentloaded", { timeout: 90000 }).catch(() => {});
}

async function searchKeyword(page: Page, keyword: string): Promise<SelgrosProduct[]> {
  // Wir sind jetzt sicher im Shop. Jetzt suchen wir nach einem benutzbaren Suchfeld.
  const searchInput = page
    .locator('input[type="search"]:not([readonly])')
    .first();

  await searchInput.waitFor({ state: "visible", timeout: 60000 });
  await searchInput.click();
  await searchInput.fill(keyword);
  await searchInput.press("Enter");

  // Ergebnisse laden lassen
  await page.waitForTimeout(2000);

  // Sehr generisch: wir nehmen die ersten "article" Treffer
  const products: SelgrosProduct[] = [];
  const cards = page.locator("article");
  const count = Math.min(await cards.count(), 5);

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);

    // Name (erste Textzeile)
    const text = ((await card.textContent()) || "").trim();
    const name = text.split("\n").map(t => t.trim()).filter(Boolean)[0] || `Treffer ${i + 1}`;

    // Link
    const href = await card.locator("a").first().getAttribute("href").catch(() => null);
    const url = href ? (href.startsWith("http") ? href : `https://www.selgros.de${href}`) : undefined;

    products.push({ name, url });
  }

  return products;
}

export async function runSelgrosSearch(keywords: string[]) {
  const browser: Browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await ensureInShop(page);

    const results = [];
    for (const keyword of keywords) {
      const products = await searchKeyword(page, keyword);
      results.push({ keyword, products });
    }
    return results;
  } finally {
    await browser.close();
  }
}
