import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { snapshotBothThemes } from "./snapshot-both-themes";

async function gotoSeedStoryDetail(
  page: Page,
  baseURL: string,
): Promise<Locator> {
  await page.goto(`${baseURL}/projects/seed-proj/issues/seed-story-flight`);
  const main = page.getByRole("main");
  await expect(main.getByText("Story", { exact: true }).first()).toBeVisible();
  await expect(main.getByText("Story in flight").first()).toBeVisible();
  return main;
}

test.describe("issue detail", () => {
  // Sole both-theme key-surface snapshot for the two-region issue detail.
  test("both-theme two-region key-surface snapshot", async ({
    page,
    seededApp,
  }) => {
    const main = await gotoSeedStoryDetail(page, seededApp.baseURL);

    await expect(main.locator('[data-region="companion"]')).toHaveAttribute(
      "data-state",
      "expanded",
    );
    await expect(main.getByText("Description")).toBeVisible();
    await expect(main.getByText("Part of")).toBeVisible();
    await expect(main.locator('[data-region="meta-scalars"]')).toBeVisible();
    await expect(main.locator('[data-region="own-flow"]')).toBeAttached();

    await snapshotBothThemes(page, "issue-detail");
  });
});
