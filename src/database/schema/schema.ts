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

/** Optional, one-to-one local inventory configuration for a medication. */
export const CREATE_MEDICATION_INVENTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS medication_inventory (
    medication_id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    tracking_enabled INTEGER NOT NULL DEFAULT 0 CHECK (tracking_enabled IN (0, 1)),
    current_quantity REAL NOT NULL CHECK (current_quantity >= 0),
    unit TEXT NOT NULL,
    consumption_per_taken REAL NOT NULL CHECK (consumption_per_taken > 0),
    low_stock_threshold REAL NOT NULL CHECK (low_stock_threshold >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (medication_id)
      REFERENCES medications(id)
      ON DELETE CASCADE
  );
`;

/**
 * Local audit trail for inventory changes. Cycle 02 writes exactly one
 * dose_consumption event for a successfully recorded Taken dose.
 */
export const CREATE_INVENTORY_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS inventory_events (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    medication_id TEXT NOT NULL,
    dose_id TEXT,
    operation_id TEXT,
    event_type TEXT NOT NULL,
    quantity_delta REAL NOT NULL,
    quantity_before REAL NOT NULL,
    quantity_after REAL NOT NULL,
    unit_snapshot TEXT,
    created_at TEXT NOT NULL
  );
`;

export const CREATE_MEDICATION_INVENTORY_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS medication_inventory_by_profile
  ON medication_inventory (profile_id, tracking_enabled, medication_id);
`;

export const CREATE_INVENTORY_DOSE_CONSUMPTION_UNIQUE_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS inventory_events_dose_consumption_unique
  ON inventory_events (dose_id)
  WHERE dose_id IS NOT NULL AND event_type = 'dose_consumption';
`;

/** History is profile-scoped and newest-first for one medication. */
export const CREATE_INVENTORY_EVENTS_HISTORY_INDEX = `
  CREATE INDEX IF NOT EXISTS inventory_events_by_profile_medication_created
  ON inventory_events (profile_id, medication_id, created_at DESC, id DESC);
`;

/** A retry of the same Record refill submission must never add stock twice. */
export const CREATE_INVENTORY_REFILL_OPERATION_UNIQUE_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS inventory_events_refill_operation_unique
  ON inventory_events (profile_id, medication_id, operation_id)
  WHERE operation_id IS NOT NULL AND event_type = 'refill_addition';
`;

/** Durable low-stock episode state. Native notification IDs are derived device state. */
export const CREATE_REFILL_ALERT_STATES_TABLE = `
  CREATE TABLE IF NOT EXISTS refill_alert_states (
    profile_id TEXT NOT NULL,
    medication_id TEXT NOT NULL,
    episode_active INTEGER NOT NULL DEFAULT 0 CHECK (episode_active IN (0, 1)),
    alert_status TEXT NOT NULL DEFAULT 'normal' CHECK (alert_status IN ('normal', 'pending', 'alerted', 'permission_required', 'scheduling_failed', 'inactive')),
    native_notification_id TEXT,
    attempted_at TEXT,
    alerted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, medication_id),
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
  );
`;

export const CREATE_REFILL_ALERT_STATES_ACCOUNT_INDEX = `
  CREATE INDEX IF NOT EXISTS refill_alert_states_by_profile_and_status
  ON refill_alert_states (profile_id, episode_active, alert_status, medication_id);
`;

/**
 * The current stock effect of a dose. Inventory events remain the audit trail;
 * this row makes a Taken <-> Skipped correction safe even after configuration
 * values have changed.
 */
export const CREATE_DOSE_INVENTORY_EFFECTS_TABLE = `
  CREATE TABLE IF NOT EXISTS dose_inventory_effects (
    dose_id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    medication_id TEXT NOT NULL,
    is_applied INTEGER NOT NULL CHECK (is_applied IN (0, 1)),
    applied_quantity REAL NOT NULL CHECK (applied_quantity >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_DOSE_INVENTORY_EFFECTS_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS dose_inventory_effects_by_profile
  ON dose_inventory_effects (profile_id, medication_id, is_applied);
`;

export const CREATE_REMINDER_OCCURRENCES_TABLE = `
  CREATE TABLE IF NOT EXISTS scheduled_reminder_occurrences (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    medication_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    native_notification_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'cancelled', 'cleanup_failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (schedule_id, scheduled_date, scheduled_time)
  );
`;

export const CREATE_REMINDER_OCCURRENCES_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS reminder_occurrences_by_profile_and_schedule
  ON scheduled_reminder_occurrences (profile_id, schedule_id, scheduled_date, status);
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
    status_recorded_at TEXT,
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
