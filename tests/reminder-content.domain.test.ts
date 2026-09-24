import assert from "node:assert/strict";
import test from "node:test";
import { getStatusAwareReminderContent } from "../src/notifications/reminder-content.domain";

test("pending reminder keeps normal medication wording", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: false, status: "pending" });
  assert.equal(content.title, "Medication Reminder");
  assert.match(content.body, /Time to take Paracetamol/);
});

test("taken and skipped reminders report status without prompting another dose", () => {
  for (const status of ["taken", "skipped"] as const) {
    const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: false, status, statusRecordedAt: "2026-09-23T08:25:00" });
    assert.match(content.body, new RegExp(status === "taken" ? "Taken" : "Skipped"));
    assert.match(content.body, /open Mr. Pill Pal/i);
    assert.doesNotMatch(content.body, /take another dose|if not taken/i);
  }
});

test("privacy mode removes medication name from finalized reminder content", () => {
  const content = getStatusAwareReminderContent({ medicationName: "Paracetamol", hideMedicationName: true, status: "taken", statusRecordedAt: "2026-09-23T08:25:00" });
  assert.equal(content.title, "Medication status reminder");
  assert.doesNotMatch(content.body, /Paracetamol/);
});
