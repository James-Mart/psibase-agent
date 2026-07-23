import { expect, type Page } from "@playwright/test";

const THEME_STORAGE_KEY = "ui-theme";
const THEMES = ["dark", "light"] as const;

type Theme = (typeof THEMES)[number];

export async function expectThemeState(
  page: Page,
  expected: { dataTheme: Theme; storage: Theme | null },
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected.dataTheme);
  const storage = await page.evaluate(
    (key) => localStorage.getItem(key),
    THEME_STORAGE_KEY,
  );
  expect(storage).toBe(expected.storage);
}

async function applyTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.evaluate(
    ({ key, theme: next }) => {
      localStorage.setItem(key, next);
    },
    { key: THEME_STORAGE_KEY, theme },
  );
  // Reload so index.html / theme store re-read `ui-theme` and set `data-theme`.
  // Avoid `networkidle` — the app keeps the issues API warm with polling.
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await page.evaluate(() => document.fonts.ready);
}

/** Capture `toHaveScreenshot` for dark and light via `ui-theme` / `data-theme`. */
export async function snapshotBothThemes(page: Page, name: string): Promise<void> {
  for (const theme of THEMES) {
    await applyTheme(page, theme);
    await expect(page).toHaveScreenshot(`${name}-${theme}.png`);
  }
}
