export type NotificationPanelLayout = {
  width: number;
  maxHeight: number;
  emptyMinHeight: number;
  listMaxHeight: number;
};

export function getNotificationPanelLayout(
  screenWidth: number,
  screenHeight: number,
  topInset: number,
  bottomInset: number,
): NotificationPanelLayout {
  const availableHeight = Math.max(0, screenHeight - topInset - bottomInset - 22);
  const maxHeight = Math.min(availableHeight, Math.max(180, Math.floor(availableHeight * 0.74)));

  return {
    width: Math.max(0, Math.min(328, screenWidth - 32)),
    maxHeight,
    emptyMinHeight: Math.min(370, maxHeight),
    listMaxHeight: Math.max(72, maxHeight - 152),
  };
}
