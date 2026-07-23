/** Mainline scrim: a soft void wash behind dialogs and sheets, blurred, with fade in/out. */
export const overlayScrim =
  "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

/** Floating panel chrome: panel fill, hairline rail, ink text — for tooltips and menus. */
export const popoverSurface =
  "border border-border bg-popover text-popover-foreground";
