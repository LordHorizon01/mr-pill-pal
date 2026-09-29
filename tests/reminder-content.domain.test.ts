import assert from "node:assert/strict";
import test from "node:test";
import { getStatusAwareReminderContent } from "../src/notifications/reminder-content.domain";

test("pending reminder keeps normal medication wording", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: false, profileName: "Kshitij", status: "pending" });
  assert.equal(content.title, "Medication Reminder for Kshitij");
  assert.equal(content.body, "Time to take Paracetamol");
});

test("privacy mode hides both profile and medicine names for pending reminders", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: true, profileName: "Kshitij", status: "pending" });
  assert.equal(content.title, "Medication Reminder");
  assert.equal(content.body, "It is time for a medication reminder.");
  assert.doesNotMatch(`${content.title} ${content.body}`, /Kshitij|Paracetamol/);
});

test("pending reminders use the profile snapshot for the correct profile", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Metformin", hideMedicationName: false, profileName: "Dad", status: "pending" });
  assert.equal(content.title, "Medication Reminder for Dad");
  assert.equal(content.body, "Time to take Metformin");
});

test("taken and skipped reminders report status without prompting another dose", () => {
  for (const status of ["taken", "skipped"] as const) {
    const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: false, status, statusRecordedAt: "2026-09-23T08:25:00" });
    assert.match(content.body, new RegExp(status === "taken" ? "Taken" : "Skipped"));
    assert.match(content.body, /open Mr. Pill Pal/i);
    assert.doesNotMatch(content.body, /take another dose|if not taken/i);
  }
});

test("taken and skipped status titles identify the correct profile when privacy is off", () => {
  for (const status of ["taken", "skipped"] as const) {
    const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: false, profileName: "Kshitij", status, statusRecordedAt: "2026-09-23T08:25:00" });
    assert.equal(content.title, "Dose Status for Kshitij");
    assert.match(content.body, /Paracetamol/);
    assert.match(content.body, new RegExp(status === "taken" ? "Taken" : "Skipped"));
  }
});

test("privacy mode removes medication name from finalized reminder content", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: true, status: "taken", statusRecordedAt: "2026-09-23T08:25:00" });
  assert.equal(content.title, "Medication status reminder");
  assert.doesNotMatch(content.body, /Paracetamol/);
});

test("privacy mode hides profile and medication names from finalized status notifications", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: true, profileName: "Kshitij", status: "skipped", statusRecordedAt: "2026-09-23T08:25:00" });
  assert.doesNotMatch(`${content.title} ${content.body}`, /Kshitij|Paracetamol/);
});
