import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gotoOverviewStructure } from "./seed-navigation";
import { snapshotBothThemes } from "./snapshot-both-themes";

async function openNewEpicDialog(page: Page): Promise<void> {
  await page
    .getByRole("tabpanel", { name: "Structure" })
    .getByRole("button", { name: "New epic" })
    .click();
  const dialog = page.getByTestId("new-issue-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "New epic" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Add an Epic under this project."),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
}

test.describe("new-issue dialog", () => {
  test("creates an Epic via the dialog", async ({ page, seededApp }) => {
    await gotoOverviewStructure(page, seededApp.baseURL);
    await openNewEpicDialog(page);

    const dialog = page.getByTestId("new-issue-dialog");
    await dialog.getByLabel("Title").fill("Epic from dialog");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("tabpanel", { name: "Structure" })
        .getByRole("link", { name: /^Epic from dialog\b/ }),
    ).toBeVisible();
  });

  // Sole both-theme key-surface snapshot for the new-issue dialog.
  test("both-theme new-issue dialog snapshot", async ({ page, seededApp }) => {
    await gotoOverviewStructure(page, seededApp.baseURL);
    await snapshotBothThemes(page, "new-issue-dialog", async () => {
      await openNewEpicDialog(page);
      await expect(page.getByTestId("new-issue-dialog")).toBeVisible();
    });
  });
});
