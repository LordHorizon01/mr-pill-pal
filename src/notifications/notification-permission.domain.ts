export type NotificationPermissionRecoveryAction = "continue" | "request" | "settings";

export function getNotificationPermissionRecoveryAction(input: {
  granted: boolean;
  canAskAgain: boolean;
}): NotificationPermissionRecoveryAction {
  if (input.granted) return "continue";
  return input.canAskAgain ? "request" : "settings";
}
