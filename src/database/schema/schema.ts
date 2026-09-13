export const CREATE_MEDICATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    instructions TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_SCHEDULES_TABLE = `
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT,
    medication_id TEXT NOT NULL,
    type TEXT NOT NULL,
    time TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    repeat_days TEXT,
    notification_id TEXT,
    notification_ids TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    reminder_status TEXT NOT NULL DEFAULT 'active',
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
    profile_id TEXT,
    medication_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'taken', 'skipped', 'missed')),
    taken_at TEXT,
    notes TEXT,
    medication_name TEXT,
    medication_dosage TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_APP_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_LOCAL_PROFILES_TABLE = `
  CREATE TABLE IF NOT EXISTS local_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    account_uid TEXT NOT NULL,
    full_name TEXT NOT NULL,
    nickname TEXT,
    date_of_birth TEXT NOT NULL,
    relationship TEXT NOT NULL,
    avatar_url TEXT,
    medical_details_json TEXT,
    role TEXT NOT NULL DEFAULT 'SELF',
    is_active INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_LOCAL_PROFILES_ACCOUNT_INDEX = `
  CREATE INDEX IF NOT EXISTS local_profiles_by_account_and_status
  ON local_profiles (account_uid, is_active, deleted_at, updated_at DESC);
`;

export const CREATE_MEDICATION_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS medications_by_profile_and_status
  ON medications (profile_id, archived_at, is_active, created_at DESC);
`;

export const CREATE_SCHEDULE_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS schedules_by_profile_and_status
  ON schedules (profile_id, is_active, reminder_status, time);
`;

export const CREATE_DOSE_PROFILE_DATE_INDEX = `
  CREATE INDEX IF NOT EXISTS dose_records_by_profile_date_and_time
  ON dose_records (profile_id, scheduled_date, scheduled_time);
`;

export const CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS dose_records_schedule_occurrence_unique
  ON dose_records (schedule_id, scheduled_date, scheduled_time)
  WHERE scheduled_date IS NOT NULL AND scheduled_time IS NOT NULL;
`;

export const CREATE_DOSE_DATE_INDEX = `
  CREATE INDEX IF NOT EXISTS dose_records_by_scheduled_date_and_time
  ON dose_records (scheduled_date, scheduled_time);
`;

export const CREATE_DOSE_HISTORY_INDEX = `
  CREATE INDEX IF NOT EXISTS dose_records_history_query
  ON dose_records (scheduled_date DESC, scheduled_time DESC, status, medication_id);
`;
