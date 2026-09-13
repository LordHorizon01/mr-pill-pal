import { ReminderSettingsOverview, ReminderStatus } from "../schedules/schedule.types";

export function getReminderHealthLabel(overview: ReminderSettingsOverview): string {
  if (overview.health === "permission_required") return "Permission required";
  if (overview.health === "attention_required") {
    const count = overview.affectedSchedules.length;
    return `${count} schedule${count === 1 ? " needs" : "s need"} attention`;
  }
  return "Working";
}

export function getReminderProblemLabel(
  status: Extract<ReminderStatus, "permission_required" | "scheduling_failed">,
): string {
  return status === "permission_required" ? "Notification permission required" : "Reminder setup failed";
}

/** Reuse an in-flight health check only when it belongs to the same account. */
export function canReuseReminderHealthRequest(
  activeAccountUid: string | undefined,
  requestedAccountUid: string | undefined,
): boolean {
  return activeAccountUid === requestedAccountUid;
}
