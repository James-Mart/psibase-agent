import { expect, type Page } from "@playwright/test";

const THEME_STORAGE_KEY = "ui-theme";
const THEMES = ["dark", "light"] as const;

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
