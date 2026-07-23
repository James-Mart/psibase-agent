import { expect, test } from "./fixtures";
import { snapshotBothThemes } from "./snapshot-both-themes";

test("seeded overview both-theme smoke snapshot", async ({ page, seededApp }) => {
  await page.goto(seededApp.baseURL);
  await expect(page.getByText("Story in flight").first()).toBeVisible();
  await snapshotBothThemes(page, "seeded-overview");
});
