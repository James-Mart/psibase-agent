import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { snapshotBothThemes } from "./snapshot-both-themes";

async function gotoOverviewFlow(page: Page, baseURL: string): Promise<Locator> {
  await page.goto(`${baseURL}/projects/seed-proj`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Seed Project" })).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Overview lens" }),
  ).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Flow" })).toBeVisible();
  return main;
}

function bucketSection(
  main: Locator,
  key: "ready" | "inFlight" | "blocked" | "recentlyMerged",
): Locator {
  return main.locator(`section[aria-labelledby="overview-flow-${key}"]`);
}

test.describe("overview Flow lens", () => {
  test("lens switcher persists selection and mounts placeholder panes", async ({
    page,
    seededApp,
  }) => {
    await gotoOverviewFlow(page, seededApp.baseURL);

    const tablist = page.getByRole("tablist", { name: "Overview lens" });
    const flowTab = tablist.getByRole("tab", { name: "Flow" });
    const structureTab = tablist.getByRole("tab", { name: "Structure" });
    const dependenciesTab = tablist.getByRole("tab", { name: "Dependencies" });

    await expect(flowTab).toHaveAttribute("aria-selected", "true");
    await expect(structureTab).toHaveAttribute("aria-selected", "false");
    await expect(dependenciesTab).toHaveAttribute("aria-selected", "false");
    await expect(page).not.toHaveURL(/[?&]lens=/);

    await structureTab.click();
    await expect(page).toHaveURL(/[?&]lens=structure(?:&|$)/);
    await expect(structureTab).toHaveAttribute("aria-selected", "true");
    await expect(flowTab).toHaveAttribute("aria-selected", "false");
    // Placeholder mounts are empty — attached, not visible.
    await expect(page.locator('[data-lens-mount="structure"]')).toBeAttached();
    await expect(page.getByRole("tabpanel", { name: "Flow" })).toHaveCount(0);

    await page.reload({ waitUntil: "load" });
    await expect(page).toHaveURL(/[?&]lens=structure(?:&|$)/);
    await expect(
      page.getByRole("tablist", { name: "Overview lens" }).getByRole("tab", {
        name: "Structure",
      }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-lens-mount="structure"]')).toBeAttached();

    await page
      .getByRole("tablist", { name: "Overview lens" })
      .getByRole("tab", { name: "Dependencies" })
      .click();
    await expect(page).toHaveURL(/[?&]lens=dependencies(?:&|$)/);
    await expect(
      page.locator('[data-lens-mount="dependencies"]'),
    ).toBeAttached();
    await expect(page.locator('[data-lens-mount="structure"]')).toHaveCount(0);

    await page
      .getByRole("tablist", { name: "Overview lens" })
      .getByRole("tab", { name: "Flow" })
      .click();
    await expect(page).not.toHaveURL(/[?&]lens=/);
    await expect(page.getByRole("tabpanel", { name: "Flow" })).toBeVisible();
    await expect(page.locator("[data-lens-mount]")).toHaveCount(0);
  });

  test("Flow buckets match the seeded project tree", async ({
    page,
    seededApp,
  }) => {
    const main = await gotoOverviewFlow(page, seededApp.baseURL);

    // Seed → project-scoped flowBuckets (see e2e/fixtures.ts): Ready has Epic A
    // and the not-started "Story in flight"; B/C/D are blocked; merged story is
    // recently merged; In flight is empty until a Story has branchName / pr-open.
    // Heading accessible names concatenate label + count without a space.
    const ready = bucketSection(main, "ready");
    await expect(ready.getByRole("heading", { name: "Ready2" })).toBeVisible();
    await expect(ready.getByRole("link", { name: /^Epic A\b/ })).toBeVisible();
    await expect(
      ready.getByRole("link", { name: /^Story in flight\b/ }),
    ).toBeVisible();

    const inFlight = bucketSection(main, "inFlight");
    await expect(
      inFlight.getByRole("heading", { name: "In flight0" }),
    ).toBeVisible();
    await expect(
      inFlight.getByText(
        "Nothing in flight. Pick up Ready work or start a Story.",
      ),
    ).toBeVisible();

    const blocked = bucketSection(main, "blocked");
    await expect(
      blocked.getByRole("heading", { name: "Blocked3" }),
    ).toBeVisible();
    await expect(blocked.getByRole("link", { name: /^Epic B\b/ })).toBeVisible();
    await expect(blocked.getByRole("link", { name: /^Epic C\b/ })).toBeVisible();
    await expect(blocked.getByRole("link", { name: /^Epic D\b/ })).toBeVisible();

    const merged = bucketSection(main, "recentlyMerged");
    await expect(
      merged.getByRole("heading", { name: "Recently merged1" }),
    ).toBeVisible();
    await expect(
      merged.getByRole("link", { name: /^Merged story\b/ }),
    ).toBeVisible();
  });

  test("inline needs-attention toggle persists across reload", async ({
    page,
    seededApp,
  }) => {
    const main = await gotoOverviewFlow(page, seededApp.baseURL);

    const row = main
      .getByRole("listitem")
      .filter({ hasText: "Story in flight" });
    await row.hover();

    const flag = row.getByRole("button", { name: "Flag needs attention" });
    await expect(flag).toBeVisible();
    await flag.click();

    const clear = row.getByRole("button", { name: "Clear needs attention" });
    await expect(clear).toHaveAttribute("aria-pressed", "true");

    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("tabpanel", { name: "Flow" })).toBeVisible();

    const rowAfter = page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ hasText: "Story in flight" });
    await rowAfter.hover();
    await expect(
      rowAfter.getByRole("button", { name: "Clear needs attention" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  // Sole both-theme key-surface snapshot for the project Flow overview.
  test("both-theme Flow key-surface snapshot", async ({ page, seededApp }) => {
    await gotoOverviewFlow(page, seededApp.baseURL);
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /^Story in flight\b/ }),
    ).toBeVisible();
    await snapshotBothThemes(page, "overview-flow");
  });
});
