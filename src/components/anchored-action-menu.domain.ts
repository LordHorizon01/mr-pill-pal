export type AnchoredMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnchoredMenuSize = {
  width: number;
  height: number;
};

export type AnchoredMenuWindow = {
  width: number;
  height: number;
};

export type AnchoredMenuInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type AnchoredMenuPlacement = {
  left: number;
  top: number;
  placement: "above" | "below";
};

const DEFAULT_GAP = 8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Places a compact context menu at the trigger's right edge. The preferred
 * position is above the trigger; a below-trigger position is used only when
 * the popup would otherwise enter the status-bar area.
 */
export function getAnchoredMenuPlacement(
  anchor: AnchoredMenuAnchor,
  menu: AnchoredMenuSize,
  window: AnchoredMenuWindow,
  insets: AnchoredMenuInsets,
  gap = DEFAULT_GAP,
): AnchoredMenuPlacement {
  const minimumLeft = insets.left;
  const maximumLeft = window.width - insets.right - menu.width;
  const left = clamp(anchor.x + anchor.width - menu.width, minimumLeft, maximumLeft);

  const minimumTop = insets.top;
  const maximumTop = window.height - insets.bottom - menu.height;
  const preferredTop = anchor.y - gap - menu.height;
  const canPlaceAbove = preferredTop >= minimumTop;
  const belowTop = anchor.y + anchor.height + gap;

  return {
    left,
    top: clamp(canPlaceAbove ? preferredTop : belowTop, minimumTop, maximumTop),
    placement: canPlaceAbove ? "above" : "below",
  };
}

/** Appends the neutral dismissal action without changing the business action model. */
export function withContextMenuCancel<T extends string>(actions: readonly T[]): readonly (T | "cancel")[] {
  return [...actions, "cancel"];
}
