export type NotificationPanelLayout = {
  width: number;
  maxHeight: number;
  emptyMinHeight: number;
  listMaxHeight: number;
  top: number;
  left: number;
  opensAbove: boolean;
};

export type NotificationPanelAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NotificationPanelInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function getNotificationPanelLayout(
  screenWidth: number,
  screenHeight: number,
  insets: NotificationPanelInsets,
  anchor: NotificationPanelAnchor | null,
): NotificationPanelLayout {
  const safeLeft = Math.max(16, insets.left + 8);
  const safeRight = Math.max(safeLeft, screenWidth - Math.max(16, insets.right + 8));
  const width = Math.max(0, Math.min(328, safeRight - safeLeft));
  const safeTop = Math.max(0, insets.top) + 8;
  const safeBottom = Math.max(safeTop, screenHeight - Math.max(0, insets.bottom) - 12);
  const usableHeight = Math.max(0, safeBottom - safeTop);
  const desiredMaxHeight = Math.min(usableHeight, Math.max(180, Math.floor(usableHeight * 0.74)));

  let top = safeTop + 8;
  let availableHeight = safeBottom - top;
  let opensAbove = false;

  if (anchor) {
    const anchorTop = Math.min(safeBottom, Math.max(safeTop, anchor.y));
    const anchorBottom = Math.min(safeBottom, Math.max(anchorTop, anchor.y + anchor.height));
    const belowTop = Math.min(safeBottom, anchorBottom + 8);
    const availableBelow = Math.max(0, safeBottom - belowTop);
    const availableAbove = Math.max(0, anchorTop - safeTop - 8);
    const minimumUsefulHeight = Math.min(220, desiredMaxHeight);

    if (availableBelow < minimumUsefulHeight && availableAbove > availableBelow) {
      availableHeight = Math.min(availableAbove, desiredMaxHeight);
      top = Math.max(safeTop, anchorTop - 8 - availableHeight);
      opensAbove = true;
    } else {
      top = belowTop;
      availableHeight = availableBelow;
    }
  }

  const maxHeight = Math.max(0, Math.min(desiredMaxHeight, availableHeight));
  const rightAlignedLeft = anchor ? anchor.x + anchor.width - width : safeRight - width;
  const left = Math.max(safeLeft, Math.min(safeRight - width, rightAlignedLeft));

  return {
    width,
    maxHeight,
    emptyMinHeight: Math.min(370, maxHeight),
    listMaxHeight: Math.max(0, Math.min(maxHeight, maxHeight - 152)),
    top,
    left,
    opensAbove,
  };
}
