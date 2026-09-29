import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATE_DOSE_HISTORY_INDEX,
  CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX,
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_INVENTORY_DOSE_CONSUMPTION_UNIQUE_INDEX,
  CREATE_INVENTORY_EVENTS_HISTORY_INDEX,
  CREATE_INVENTORY_REFILL_OPERATION_UNIQUE_INDEX,
  CREATE_INVENTORY_EVENTS_TABLE,
  CREATE_REFILL_ALERT_STATES_TABLE,
  CREATE_REFILL_ALERT_STATES_ACCOUNT_INDEX,
  CREATE_DOSE_INVENTORY_EFFECTS_TABLE,
  CREATE_MEDICATION_INVENTORY_TABLE,
  CREATE_MEDICATIONS_TABLE,
  CREATE_REMINDER_OCCURRENCES_TABLE,
  CREATE_SCHEDULES_TABLE,
} from "../src/database/schema/schema";

test("dose schema protects one schedule occurrence at one date and time", () => {
  assert.match(CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX, /UNIQUE INDEX/i);
  assert.match(
    CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX,
    /schedule_id, scheduled_date, scheduled_time/i,
  );
});

test("schedule schema persists the intentional effective time used to prevent backfilled occurrences", () => {
  assert.match(CREATE_SCHEDULES_TABLE, /effective_at TEXT NOT NULL/i);
  assert.match(CREATE_SCHEDULES_TABLE, /created_at TEXT NOT NULL/i);
});

test("reminder occurrences are profile-scoped and uniquely identify a schedule date and time", () => {
  assert.match(CREATE_REMINDER_OCCURRENCES_TABLE, /profile_id TEXT NOT NULL/i);
  assert.match(CREATE_REMINDER_OCCURRENCES_TABLE, /schedule_id TEXT NOT NULL/i);
  assert.match(CREATE_REMINDER_OCCURRENCES_TABLE, /UNIQUE \(schedule_id, scheduled_date, scheduled_time\)/i);
});

test("refill foundation is optional, profile-scoped, and ready for one consumption event per dose", () => {
  assert.match(CREATE_MEDICATION_INVENTORY_TABLE, /medication_id TEXT PRIMARY KEY/i);
  assert.match(CREATE_MEDICATION_INVENTORY_TABLE, /profile_id TEXT NOT NULL/i);
  assert.match(CREATE_MEDICATION_INVENTORY_TABLE, /current_quantity REAL/i);
  assert.match(CREATE_MEDICATION_INVENTORY_TABLE, /consumption_per_taken REAL/i);
  assert.match(CREATE_INVENTORY_EVENTS_TABLE, /dose_id TEXT/i);
  assert.match(CREATE_INVENTORY_EVENTS_TABLE, /unit_snapshot TEXT/i);
  assert.match(CREATE_INVENTORY_EVENTS_TABLE, /operation_id TEXT/i);
  assert.match(CREATE_INVENTORY_DOSE_CONSUMPTION_UNIQUE_INDEX, /UNIQUE INDEX/i);
  assert.match(CREATE_INVENTORY_DOSE_CONSUMPTION_UNIQUE_INDEX, /dose_id/i);
  assert.match(CREATE_INVENTORY_DOSE_CONSUMPTION_UNIQUE_INDEX, /event_type = 'dose_consumption'/i);
});

test("inventory event schema supports profile-isolated newest-first history and idempotent refills", () => {
  assert.match(CREATE_INVENTORY_EVENTS_HISTORY_INDEX, /profile_id, medication_id, created_at DESC/i);
  assert.match(CREATE_INVENTORY_REFILL_OPERATION_UNIQUE_INDEX, /profile_id, medication_id, operation_id/i);
  assert.match(CREATE_INVENTORY_REFILL_OPERATION_UNIQUE_INDEX, /event_type = 'refill_addition'/i);
});

test("low-stock alert state is profile-scoped, durable, and unique per medication episode", () => {
  assert.match(CREATE_REFILL_ALERT_STATES_TABLE, /profile_id TEXT NOT NULL/i);
  assert.match(CREATE_REFILL_ALERT_STATES_TABLE, /medication_id TEXT NOT NULL/i);
  assert.match(CREATE_REFILL_ALERT_STATES_TABLE, /PRIMARY KEY \(profile_id, medication_id\)/i);
  assert.match(CREATE_REFILL_ALERT_STATES_TABLE, /episode_active/i);
  assert.match(CREATE_REFILL_ALERT_STATES_TABLE, /permission_required.*scheduling_failed/i);
  assert.match(CREATE_REFILL_ALERT_STATES_ACCOUNT_INDEX, /profile_id, episode_active, alert_status/i);
});

test("schema supports archive state and indexed History date queries", () => {
  assert.match(CREATE_MEDICATIONS_TABLE, /archived_at TEXT/i);
  assert.match(CREATE_DOSE_HISTORY_INDEX, /scheduled_date DESC/i);
});

test("dose schema stores the required status values and historical snapshots", () => {
  assert.match(CREATE_DOSE_RECORDS_TABLE, /pending.*taken.*skipped.*missed/i);
  assert.match(CREATE_DOSE_RECORDS_TABLE, /medication_name/i);
  assert.match(CREATE_DOSE_RECORDS_TABLE, /medication_dosage/i);
  assert.doesNotMatch(CREATE_DOSE_RECORDS_TABLE, /ON DELETE CASCADE/i);
  assert.match(CREATE_DOSE_RECORDS_TABLE, /status_recorded_at TEXT/i);
});

test("dose stock effect schema supports reversible status corrections", () => {
  assert.match(CREATE_DOSE_INVENTORY_EFFECTS_TABLE, /dose_id TEXT PRIMARY KEY/i);
  assert.match(CREATE_DOSE_INVENTORY_EFFECTS_TABLE, /is_applied/i);
  assert.match(CREATE_DOSE_INVENTORY_EFFECTS_TABLE, /applied_quantity/i);
});
