import * as SQLite from "expo-sqlite";

import {
  CREATE_APP_SETTINGS_TABLE,
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_MEDICATIONS_TABLE,
  CREATE_SCHEDULES_TABLE,
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

export function getSafeDatabaseErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const message = error instanceof Error ? error.message : "";

  return /sqlite|database|nativestatement|finalizeasync|locked/i.test(message)
    ? fallback
    : message || fallback;
}
