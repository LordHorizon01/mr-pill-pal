import * as SQLite from "expo-sqlite";

import {
  CREATE_APP_SETTINGS_TABLE,
  CREATE_DOSE_PROFILE_DATE_INDEX,
  CREATE_DOSE_DATE_INDEX,
  CREATE_DOSE_HISTORY_INDEX,
  CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX,
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_MEDICATIONS_TABLE,
  CREATE_MEDICATION_PROFILE_INDEX,
  CREATE_LOCAL_PROFILES_TABLE,
  CREATE_LOCAL_PROFILES_ACCOUNT_INDEX,
  CREATE_SCHEDULES_TABLE,
  CREATE_SCHEDULE_PROFILE_INDEX,
} from "./schema/schema";

const DATABASE_NAME = "mr-pill-pal.db";

let database: SQLite.SQLiteDatabase | null = null;
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initializationPromise: Promise<void> | null = null;
let databaseOperationQueue: Promise<void> = Promise.resolve();

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) {
    return database;
  }

  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME)
      .then(async (openedDatabase) => {
        await openedDatabase.execAsync(`
          PRAGMA journal_mode = WAL;
          PRAGMA foreign_keys = ON;
        `);

        database = openedDatabase;

        return openedDatabase;
      })
      .catch((error) => {
        databasePromise = null;
        throw error;
      });
  }

  return databasePromise;
}

async function initializeDatabaseTables(): Promise<void> {
  const db = await openDatabase();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(CREATE_MEDICATIONS_TABLE);
    await transaction.execAsync(CREATE_SCHEDULES_TABLE);
    await transaction.execAsync(CREATE_DOSE_RECORDS_TABLE);
    await transaction.execAsync(CREATE_APP_SETTINGS_TABLE);
    await transaction.execAsync(CREATE_LOCAL_PROFILES_TABLE);

    const medicationColumns = await transaction.getAllAsync<{ name: string }>(
      `PRAGMA table_info(medications);`,
    );
    if (!medicationColumns.some((column) => column.name === "archived_at")) {
      await transaction.execAsync(`ALTER TABLE medications ADD COLUMN archived_at TEXT;`);
    }

    if (!medicationColumns.some((column) => column.name === "profile_id")) {
      await transaction.execAsync(`ALTER TABLE medications ADD COLUMN profile_id TEXT;`);
    }

    const doseRecordColumns = await transaction.getAllAsync<{
      name: string;
    }>(`PRAGMA table_info(dose_records);`);

    const hasScheduledDate = doseRecordColumns.some(
      (column) => column.name === "scheduled_date",
    );

    if (!hasScheduledDate) {
      await transaction.execAsync(`
        ALTER TABLE dose_records
        ADD COLUMN scheduled_date TEXT;
      `);
    }

    const hasScheduledTime = doseRecordColumns.some(
      (column) => column.name === "scheduled_time",
    );

    if (!hasScheduledTime) {
      await transaction.execAsync(`
        ALTER TABLE dose_records
        ADD COLUMN scheduled_time TEXT;
      `);
    }

    const hasDoseNotes = doseRecordColumns.some(
      (column) => column.name === "notes",
    );

    if (!hasDoseNotes) {
      await transaction.execAsync(`
        ALTER TABLE dose_records
        ADD COLUMN notes TEXT;
      `);
    }

    if (!doseRecordColumns.some((column) => column.name === "profile_id")) {
      await transaction.execAsync(`ALTER TABLE dose_records ADD COLUMN profile_id TEXT;`);
    }

    const hasMedicationNameSnapshot = doseRecordColumns.some(
      (column) => column.name === "medication_name",
    );

    const hasMedicationDosageSnapshot = doseRecordColumns.some(
      (column) => column.name === "medication_dosage",
    );

    await transaction.execAsync(`
      UPDATE dose_records
      SET
        scheduled_date = COALESCE(scheduled_date, substr(scheduled_at, 1, 10)),
        scheduled_time = COALESCE(scheduled_time, substr(scheduled_at, 12, 5))
      WHERE scheduled_date IS NULL OR scheduled_time IS NULL;
    `);

    const doseRecordForeignKeys = await transaction.getAllAsync<{
      table: string;
      on_delete: string;
    }>(`PRAGMA foreign_key_list(dose_records);`);

    const hasCascadeDelete = doseRecordForeignKeys.some(
      (foreignKey) =>
        (foreignKey.table === "medications" || foreignKey.table === "schedules") &&
        foreignKey.on_delete.toUpperCase() === "CASCADE",
    );

    if (
      hasCascadeDelete ||
      !hasMedicationNameSnapshot ||
      !hasMedicationDosageSnapshot
    ) {
      const medicationNameSource = hasMedicationNameSnapshot
        ? "COALESCE(medication_name, (SELECT name FROM medications WHERE medications.id = medication_id), 'Medication unavailable')"
        : "COALESCE((SELECT name FROM medications WHERE medications.id = medication_id), 'Medication unavailable')";
      const medicationDosageSource = hasMedicationDosageSnapshot
        ? "COALESCE(medication_dosage, (SELECT dosage FROM medications WHERE medications.id = medication_id), '')"
        : "COALESCE((SELECT dosage FROM medications WHERE medications.id = medication_id), '')";

      await transaction.execAsync(
        `DROP INDEX IF EXISTS dose_records_schedule_occurrence_unique;`,
      );
      await transaction.execAsync(
        `ALTER TABLE dose_records RENAME TO dose_records_legacy;`,
      );
      await transaction.execAsync(CREATE_DOSE_RECORDS_TABLE);
      await transaction.execAsync(`
        INSERT INTO dose_records (
          id,
          medication_id,
          schedule_id,
          scheduled_date,
          scheduled_time,
          scheduled_at,
          status,
          taken_at,
          notes,
          medication_name,
          medication_dosage,
          created_at,
          updated_at
        )
        SELECT
          id,
          medication_id,
          schedule_id,
          COALESCE(scheduled_date, substr(scheduled_at, 1, 10)),
          COALESCE(scheduled_time, substr(scheduled_at, 12, 5)),
          COALESCE(
            scheduled_at,
            COALESCE(scheduled_date, substr(scheduled_at, 1, 10)) ||
              'T' ||
              COALESCE(scheduled_time, substr(scheduled_at, 12, 5)) ||
              ':00'
          ),
          status,
          taken_at,
          notes,
          ${medicationNameSource},
          ${medicationDosageSource},
          created_at,
          updated_at
        FROM dose_records_legacy;
      `);
      await transaction.execAsync(`DROP TABLE dose_records_legacy;`);
    }

    await transaction.execAsync(CREATE_DOSE_OCCURRENCE_UNIQUE_INDEX);
    await transaction.execAsync(CREATE_DOSE_DATE_INDEX);
    await transaction.execAsync(CREATE_DOSE_HISTORY_INDEX);

    const scheduleColumns = await transaction.getAllAsync<{
      name: string;
    }>(`PRAGMA table_info(schedules);`);

    const hasNotificationId = scheduleColumns.some(
      (column) => column.name === "notification_id",
    );

    if (!hasNotificationId) {
      await transaction.execAsync(`
        ALTER TABLE schedules
        ADD COLUMN notification_id TEXT;
      `);
    }

    const hasNotificationIds = scheduleColumns.some(
      (column) => column.name === "notification_ids",
    );

    if (!hasNotificationIds) {
      await transaction.execAsync(`
        ALTER TABLE schedules
        ADD COLUMN notification_ids TEXT;
      `);
    }

    const hasReminderStatus = scheduleColumns.some(
      (column) => column.name === "reminder_status",
    );

    if (!hasReminderStatus) {
      await transaction.execAsync(`
        ALTER TABLE schedules
        ADD COLUMN reminder_status TEXT NOT NULL DEFAULT 'active';
      `);

      await transaction.execAsync(`
        UPDATE schedules
        SET reminder_status = CASE
          WHEN is_active = 1 THEN 'active'
          ELSE 'paused'
        END;
      `);
    }

    if (!scheduleColumns.some((column) => column.name === "profile_id")) {
      await transaction.execAsync(`ALTER TABLE schedules ADD COLUMN profile_id TEXT;`);
    }

    await transaction.execAsync(CREATE_LOCAL_PROFILES_ACCOUNT_INDEX);
    await transaction.execAsync(CREATE_MEDICATION_PROFILE_INDEX);
    await transaction.execAsync(CREATE_SCHEDULE_PROFILE_INDEX);
    await transaction.execAsync(CREATE_DOSE_PROFILE_DATE_INDEX);
  });
}

export async function initializeDatabase(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = initializeDatabaseTables().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  await initializeDatabase();

  if (!database) {
    throw new Error("Database could not be opened.");
  }

  return database;
}

export async function runDatabaseOperation<T>(
  operation: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  const previousOperation = databaseOperationQueue;
  let releaseOperation!: () => void;

  databaseOperationQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation;

  try {
    return await operation(db);
  } finally {
    releaseOperation();
  }
}

export async function runExclusiveDatabaseTransaction<T>(
  operation: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  return runDatabaseOperation(async (db) => {
    let result!: T;

    await db.withExclusiveTransactionAsync(async (transaction) => {
      result = await operation(transaction);
    });

    return result;
  });
}

export function getSafeDatabaseErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const message = error instanceof Error ? error.message : "";

  return /sqlite|database|nativestatement|finalizeasync|locked/i.test(message)
    ? fallback
    : message || fallback;
}
