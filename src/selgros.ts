import { chromium, Browser, Page } from "playwright";

type SelgrosProduct = {
  name: string;
  url?: string;
};

const VERSION = "SEL_BOT_V4_2026-02-04";
const SHOP_URL = "https://www.selgros.de/shop/products";

function fail(msg: string): never {
  throw new Error(`${VERSION}: ${msg}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Missing environment variable: ${name}`);
  return value;
}

function isAzureLogin(url: string) {
  return url.includes("b2clogin.com");
}

async function gotoShop(page: Page) {
  await page.goto(SHOP_URL, { waitUntil: "domcontentloaded" });
}

async function doLogin(page: Page) {
  const username = requireEnv("SELGROS_USERNAME");
  const password = requireEnv("SELGROS_PASSWORD");

  // Wir sind auf Azure B2C Login
  const userInput = page
    .locator('input[type="email"], input[name="loginfmt"], input[autocomplete="username"]')
    .first();

  await userInput.waitFor({ state: "visible", timeout: 60000 });
  await userInput.fill(username);

  const nextBtn = page.getByRole("button", { name: /weiter|next|continue/i }).first();
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click();
  }

  const passInput = page.locator('input[type="password"], input[name="passwd"]').first();
  await passInput.waitFor({ state: "visible", timeout: 60000 });
  await passInput.fill(password);

  const signInBtn = page.getByRole("button", { name: /anmelden|login|sign in/i }).first();
  await signInBtn.click();

  // Warten bis Redirects durch sind
  await page.waitForLoadState("domcontentloaded", { timeout: 90000 }).catch(() => {});
}

async function ensureLoggedInShop(page: Page) {
  await gotoShop(page);

  // Wenn wir direkt in Azure landen: Login versuchen
  if (isAzureLogin(page.url())) {
    await doLogin(page);
    await gotoShop(page);
  }

  // Wenn wir immer noch Azure sehen -> Login ist blockiert oder nicht abgeschlossen
  if (isAzureLogin(page.url())) {
    fail(`Still on Azure login after login attempt. Current URL: ${page.url()}`);
  }

  // Wenn wir nicht im Shop sind -> ebenfalls abbrechen
  if (!page.url().includes("/shop/")) {
    fail(`Not in shop after login attempt. Current URL: ${page.url()}`);
  }
}

async function searchKeyword(page: Page, keyword: string): Promise<SelgrosProduct[]> {
  // Falls Selgros uns währenddessen wieder in Azure wirft, sofort abbrechen:
  if (isAzureLogin(page.url())) {
    fail(`Redirected back to Azure before search. Current URL: ${page.url()}`);
  }

  const searchInput = page.locator('input[type="search"]:not([readonly])').first();

  // Wenn das Suchfeld nicht sichtbar ist, prüfen wir auch die URL (oft Redirect)
  try {
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    if (isAzureLogin(page.url())) {
      fail(`Redirected back to Azure while waiting for search input. Current URL: ${page.url()}`);
    }
    fail(`Search input not visible in shop (maybe cookie banner/store selection). Current URL: ${page.url()}`);
  }

  await searchInput.click();
  await searchInput.fill(keyword);
  await searchInput.press("Enter");

  await page.waitForTimeout(2000);

  if (isAzureLogin(page.url())) {
    fail(`Redirected back to Azure after pressing Enter. Current URL: ${page.url()}`);
  }

  const products: SelgrosProduct[] = [];
  const cards = page.locator("article");
  const count = Math.min(await cards.count(), 5);

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const text = ((await card.textContent()) || "").trim();
    const name =
      text.split("\n").map(t => t.trim()).filter(Boolean)[0] || `Treffer ${i + 1}`;

    const href = await card.locator("a").first().getAttribute("href").catch(() => null);
    const url = href ? (href.startsWith("http") ? href : `https://www.selgros.de${href}`) : undefined;

    products.push({ name, url });
  }

  return products;
}

export async function runSelgrosSearch(keywords: string[]) {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  try {
    const context = await browser.newContext({
      locale: "de-DE",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();

    await ensureLoggedInShop(page);

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
