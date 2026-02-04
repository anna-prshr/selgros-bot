import { chromium, Browser, Page } from "playwright";

type SelgrosProduct = {
  name: string;
  price?: string;
  url?: string;
};

const START_URL = "https://www.selgros.de/shop/products";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function loginIfNeeded(page: Page) {
  await page.goto(START_URL, { waitUntil: "domcontentloaded" });

  // Wenn wir nicht im Shop landen, sind wir im Login
  if (!page.url().includes("/shop/")) {
    const username = requireEnv("SELGROS_USERNAME");
    const password = requireEnv("SELGROS_PASSWORD");

    // Benutzername / E-Mail
    const userInput = page.locator('input[type="email"], input[name="loginfmt"], input[autocomplete="username"]').first();
    await userInput.waitFor({ timeout: 30000 });
    await userInput.fill(username);

    const nextButton = page.getByRole("button", { name: /weiter|next|continue|anmelden/i }).first();
    await nextButton.click();

    // Passwort
    const passwordInput = page.locator('input[type="password"], input[name="passwd"]').first();
    await passwordInput.waitFor({ timeout: 30000 });
    await passwordInput.fill(password);

    const loginButton = page.getByRole("button", { name: /anmelden|login|sign in/i }).first();
    await loginButton.click();

    // Warten bis wir wieder im Shop sind
    await page.waitForURL(url => url.toString().includes("/shop/"), { timeout: 60000 });
  }
}

async function searchKeyword(page: Page, keyword: string): Promise<SelgrosProduct[]> {
  const searchInput = page.locator('input[type="search"], input[placeholder*="Suche"]').first();
  await searchInput.waitFor({ timeout: 30000 });
  await searchInput.fill(keyword);
  await searchInput.press("Enter");

  await page.waitForTimeout(2000);

  const products: SelgrosProduct[] = [];

  const productCards = page.locator("article");
  const count = Math.min(await productCards.count(), 5);

  for (let i = 0; i < count; i++) {
    const card = productCards.nth(i);
    const text = (await card.textContent())?.trim() || "";

    const link = await card.locator("a").first().getAttribute("href").catch(() => null);

    products.push({
      name: text.split("\n")[0],
      url: link ? `https://www.selgros.de${link}` : undefined
    });
  }

  return products;
}

export async function runSelgrosSearch(keywords: string[]) {
  const browser: Browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginIfNeeded(page);

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
