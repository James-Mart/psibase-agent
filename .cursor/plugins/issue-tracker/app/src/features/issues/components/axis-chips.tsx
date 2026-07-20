import type {
  EpicStatus,
  RetroStatus,
  SpecReviewStatus,
  StoryStatus,
} from "@server/schemas";
import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  EPIC_STATUS_BADGE_VARIANT,
  EPIC_STATUS_LABEL,
  RETRO_BADGE_VARIANT,
  RETRO_LABEL,
  SPEC_REVIEW_BADGE_VARIANT,
  SPEC_REVIEW_LABEL,
  STORY_STATUS_BADGE_VARIANT,
  STORY_STATUS_LABEL,
} from "../lib/derived";

type ChipConfig = {
  variant: NonNullable<BadgeProps["variant"]>;
  label: string;
};

type SecondChipConfig = ChipConfig & {
  prefix: string;
};

export function DualAxisChips({
  primary,
  secondary,
  className,
}: {
  primary?: ChipConfig;
  secondary?: SecondChipConfig;
  className?: string;
}) {
  if (!primary && !secondary) return null;

  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {primary ? (
        <Badge variant={primary.variant}>{primary.label}</Badge>
      ) : null}
      {secondary ? (
        <Badge variant={secondary.variant}>
          {secondary.prefix}: {secondary.label}
        </Badge>
      ) : null}
    </span>
  );
}

export function storyAxesVisible(
  storyStatus?: StoryStatus,
  specReview?: SpecReviewStatus,
) {
  return Boolean(storyStatus || specReview);
}

export function StoryAxisChips({
  storyStatus,
  specReview,
  className,
}: {
  storyStatus?: StoryStatus;
  specReview?: SpecReviewStatus;
  className?: string;
}) {
  return (
    <DualAxisChips
      className={className}
      primary={
        storyStatus
          ? {
              variant: STORY_STATUS_BADGE_VARIANT[storyStatus],
              label: STORY_STATUS_LABEL[storyStatus],
            }
          : undefined
      }
      secondary={
        specReview
          ? {
              variant: SPEC_REVIEW_BADGE_VARIANT[specReview],
              label: SPEC_REVIEW_LABEL[specReview],
              prefix: "specReview",
            }
          : undefined
      }
    />
  );
}

export function epicAxesVisible(epicStatus?: EpicStatus, retro?: RetroStatus) {
  return Boolean(epicStatus || retro);
}

export function EpicAxisChips({
  epicStatus,
  retro,
  className,
}: {
  epicStatus?: EpicStatus;
  retro?: RetroStatus;
  className?: string;
}) {
  return (
    <DualAxisChips
      className={className}
      primary={
        epicStatus
          ? {
              variant: EPIC_STATUS_BADGE_VARIANT[epicStatus],
              label: EPIC_STATUS_LABEL[epicStatus],
            }
          : undefined
      }
      secondary={
        retro
          ? {
              variant: RETRO_BADGE_VARIANT[retro],
              label: RETRO_LABEL[retro],
              prefix: "retro",
            }
          : undefined
      }
    />
  );
}
