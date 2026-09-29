import { DoseStatus } from "../features/doses/dose.types";

export type ReminderContent = { title: string; body: string };

function statusTime(timestamp?: string): string {
  if (!timestamp) return "an earlier time";
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function getStatusAwareReminderContent(input: {
  medicationName: string;
  hideMedicationName: boolean;
  profileName?: string;
  status?: DoseStatus;
  statusRecordedAt?: string;
}): ReminderContent {
  const { medicationName, hideMedicationName, profileName, status, statusRecordedAt } = input;
  if (status !== "taken" && status !== "skipped") {
    return {
      title: hideMedicationName || !profileName
        ? "Medication Reminder"
        : `Medication Reminder for ${profileName}`,
      body: hideMedicationName
        ? "It is time for a medication reminder."
        : `Time to take ${medicationName}`,
    };
  }

  const statusLabel = status === "taken" ? "Taken" : "Skipped";
  const title = hideMedicationName
    ? "Medication status reminder"
    : profileName
      ? `Dose Status for ${profileName}`
      : (status === "taken" ? "Dose already recorded" : "Dose status reminder");
  const subject = hideMedicationName ? "This dose" : medicationName;
  return {
    title,
    body: `${subject} was recorded as ${statusLabel} at ${statusTime(statusRecordedAt)}. If this is incorrect, open Mr. Pill Pal to review and update the status.`,
  };
}
