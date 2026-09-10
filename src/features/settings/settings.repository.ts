import { runDatabaseOperation } from "@/database/database";

const HIDE_MEDICATION_NAME_KEY = "hide_medication_name_on_lock_screen";

type SettingRow = {
  value: string;
};

export async function getHideMedicationName(): Promise<boolean> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<SettingRow>(
      `SELECT value
     FROM app_settings
     WHERE key = ?`,
      [HIDE_MEDICATION_NAME_KEY],
    );

    return row?.value === "true";
  });
}

export async function saveHideMedicationName(
  hideMedicationName: boolean,
): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(
      `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
      [
        HIDE_MEDICATION_NAME_KEY,
        hideMedicationName ? "true" : "false",
        new Date().toISOString(),
      ],
    );
  });
}
