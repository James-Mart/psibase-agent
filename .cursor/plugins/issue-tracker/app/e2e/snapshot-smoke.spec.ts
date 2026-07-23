import { expect, test } from "./fixtures";
import { snapshotBothThemes } from "./snapshot-both-themes";

// Harness smoke: proves `snapshotBothThemes` against the seeded project overview.
// The cockpit key-surface snapshot lives in `cockpit.spec.ts`.
test("seeded overview both-theme smoke snapshot", async ({ page, seededApp }) => {
  await page.goto(`${seededApp.baseURL}/projects/seed-proj`);
  await expect(page.getByRole("main").getByText("Seed Project")).toBeVisible();
  await expect(page.getByText("Story in flight").first()).toBeVisible();
  await snapshotBothThemes(page, "seeded-overview");
});
