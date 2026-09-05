import * as SQLite from "expo-sqlite";

import {
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_MEDICATIONS_TABLE,
  CREATE_SCHEDULES_TABLE,
} from "./schema/schema";

const DATABASE_NAME = "mr-pill-pal.db";

let database: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) {
    return database;
  }

  database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await database.execAsync(`
    PRAGMA foreign_keys = ON;
  `);

  return database;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(CREATE_MEDICATIONS_TABLE);
  await db.execAsync(CREATE_SCHEDULES_TABLE);
  await db.execAsync(CREATE_DOSE_RECORDS_TABLE);
}