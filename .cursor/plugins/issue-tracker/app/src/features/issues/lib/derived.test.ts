import { describe, expect, it } from "vitest";
import {
  EPIC_STATUSES,
  QA_STATUSES,
  RETRO_STATUSES,
  SPEC_REVIEW_STATUSES,
  STORY_STATUSES,
  TASK_STATUSES,
} from "@server/schemas";
import { BADGE_VARIANTS } from "@/components/ui/badge";
import {
  EPIC_STATUS_BADGE_VARIANT,
  QA_STATUS_BADGE_VARIANT,
  RETRO_BADGE_VARIANT,
  SPEC_REVIEW_BADGE_VARIANT,
  STORY_STATUS_BADGE_VARIANT,
  TASK_STATUS_BADGE_VARIANT,
} from "./derived";

const badgeVariantSet = new Set<string>(BADGE_VARIANTS);

function expectMapCovers<S extends string>(
  statuses: readonly S[],
  map: Record<S, string>,
) {
  for (const status of statuses) {
    expect(badgeVariantSet.has(map[status])).toBe(true);
  }
}

describe("status badge variant maps", () => {
  it("maps every task status to an existing Badge variant", () => {
    expectMapCovers(TASK_STATUSES, TASK_STATUS_BADGE_VARIANT);
  });

  it("maps fixing to the current hue (not warn)", () => {
    expect(TASK_STATUS_BADGE_VARIANT.fixing).toBe("current");
    expect(TASK_STATUS_BADGE_VARIANT.fixing).not.toBe("warn");
    expect(TASK_STATUS_BADGE_VARIANT["in-progress"]).toBe("inProgress");
  });

  it("maps every qa status to an existing Badge variant", () => {
    expectMapCovers(QA_STATUSES, QA_STATUS_BADGE_VARIANT);
  });

  it("maps every story status to an existing Badge variant", () => {
    expectMapCovers(STORY_STATUSES, STORY_STATUS_BADGE_VARIANT);
  });

  it("maps every epic status to an existing Badge variant", () => {
    expectMapCovers(EPIC_STATUSES, EPIC_STATUS_BADGE_VARIANT);
  });

  it("maps every specReview status to an existing Badge variant", () => {
    expectMapCovers(SPEC_REVIEW_STATUSES, SPEC_REVIEW_BADGE_VARIANT);
  });

  it("maps every retro status to an existing Badge variant", () => {
    expectMapCovers(RETRO_STATUSES, RETRO_BADGE_VARIANT);
  });
});
