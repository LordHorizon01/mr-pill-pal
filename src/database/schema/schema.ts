export const CREATE_MEDICATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    instructions TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_SCHEDULES_TABLE = `
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY NOT NULL,
    medication_id TEXT NOT NULL,
    type TEXT NOT NULL,
    time TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    repeat_days TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (medication_id)
      REFERENCES medications(id)
      ON DELETE CASCADE
  );
`;

export const CREATE_DOSE_RECORDS_TABLE = `
  CREATE TABLE IF NOT EXISTS dose_records (
    id TEXT PRIMARY KEY NOT NULL,
    medication_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL,
    taken_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (medication_id)
      REFERENCES medications(id)
      ON DELETE CASCADE,
    FOREIGN KEY (schedule_id)
      REFERENCES schedules(id)
      ON DELETE CASCADE
  );
`;