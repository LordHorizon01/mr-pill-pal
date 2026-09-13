import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATE_DOSE_HISTORY_INDEX,
  CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX,
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_MEDICATIONS_TABLE,
} from "../src/database/schema/schema";

test("dose schema protects one schedule occurrence at one date and time", () => {
  assert.match(CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX, /UNIQUE INDEX/i);
  assert.match(
    CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX,
    /schedule_id, scheduled_date, scheduled_time/i,
  );
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
});
