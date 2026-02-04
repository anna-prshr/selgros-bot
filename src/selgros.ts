import { chromium, Browser, Page } from "playwright";
import fs from "fs";

type SelgrosProduct = {
  name: string;
  url?: string;
};

const VERSION = "SEL_BOT_V5_SESSION_2026-02-04";
const SHOP_URL = "https://www.selgros.de/shop/products";
const STORAGE_PATH = "./selgros.storage.json";

function fail(msg: string): never {
  throw new Error(`${VERSION}: ${msg}`);
}

function isAzureLogin(url: string) {
  return url.includes("b2clogin.com");
}

function hasStorageFile() {
  return fs.existsSync(STORAGE_PATH);
}

async function ensureInShop(page: Page) {
  await page.goto(SHOP_URL, { waitUntil: "domcontentloaded" });

  if (isAzureLogin(page.url())) {
    fail(
      `Not logged in (Azure login). Please create a session first via /auth/save-session. Current URL: ${page.url()}`
    );
  }

  if (!page.url().includes("/shop/")) {
    fail(`Not in shop. Current URL: ${page.url()}`);
  }
}

async function searchKeyword(page: Page, keyword: string): Promise<SelgrosProduct[]> {
  await ensureInShop(page);

  const searchInput = page.locator('input[type="search"]:not([readonly])').first();

  try {
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    if (isAzureLogin(page.url())) {
      fail(`Redirected back to Azure while waiting for search. Current URL: ${page.url()}`);
    }
    fail(`Search input not visible. Possibly cookie banner or store selection. Current URL: ${page.url()}`);
  }

  await searchInput.click();
  await searchInput.fill(keyword);
  await searchInput.press("Enter");

  await page.waitForTimeout(2000);

  if (isAzureLogin(page.url())) {
    fail(`Redirected back to Azure after search. Current URL: ${page.url()}`);
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
  // Session MUSS existieren
  if (!hasStorageFile()) {
    fail("No saved session found. Call /auth/save-session first.");
  }

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const context = await browser.newContext({
      storageState: STORAGE_PATH,
      locale: "de-DE",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();

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

// Wird von /auth/save-session verwendet:
// Startet einen sichtbaren Browser, du loggst dich einmal ein,
// dann wird die Session gespeichert.
export async function saveSelgrosSession(): Promise<{ ok: boolean; message: string }> {
  const browser: Browser = await chromium.launch({
    headless: false, // sichtbar!
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const context = await browser.newContext({
      locale: "de-DE",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();
    await page.goto("https://www.selgros.de/shop", { waitUntil: "domcontentloaded" });

    // Du loggst dich im geöffneten Fenster ein.
    // Danach muss die Shop-Seite erreichbar sein.
    // Wir warten bis zu 5 Minuten.
    await page.waitForURL((url) => url.toString().includes("/shop"), { timeout: 300000 });

    // Wenn wir immer noch Azure sehen, war Login nicht fertig
    if (isAzureLogin(page.url())) {
      fail("Still on Azure login after manual login. Please complete login in the opened browser.");
    }

    // Session speichern
    await context.storageState({ path: STORAGE_PATH });

    return { ok: true, message: "Session saved to selgros.storage.json. You can now use /run." };
  } finally {
    await browser.close();
  }
}
