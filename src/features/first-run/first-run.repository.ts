import { runDatabaseOperation, runExclusiveDatabaseTransaction } from "@/database/database";
import {
  createFirstRunPreferenceRepository,
  FIRST_RUN_NOTIFICATION_PRIMER_KEY,
  FIRST_RUN_ONBOARDING_KEY,
  FirstRunPreferenceStorage,
} from "./first-run.domain";

type SettingRow = { value: string };
type LegacyDataRow = { has_data: number };

const storage: FirstRunPreferenceStorage = {
  get: (key) => runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<SettingRow>(`SELECT value FROM app_settings WHERE key = ?`, [key]);
    return row?.value ?? null;
  }),
  set: (key, value) => runDatabaseOperation(async (db) => {
    await db.runAsync(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, new Date().toISOString()],
    );
  }),
  hasLegacyAppData: () => runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<LegacyDataRow>(
      `SELECT CASE WHEN
        EXISTS (SELECT 1 FROM local_profiles LIMIT 1) OR
        EXISTS (SELECT 1 FROM medications LIMIT 1) OR
        EXISTS (SELECT 1 FROM schedules LIMIT 1) OR
        EXISTS (SELECT 1 FROM dose_records LIMIT 1) OR
        EXISTS (SELECT 1 FROM app_settings WHERE key IN ('appearance_preference', 'hide_medication_name_on_lock_screen') LIMIT 1)
       THEN 1 ELSE 0 END AS has_data`,
    );
    return row?.has_data === 1;
  }),
  resetFirstRunPreferences: () => runExclusiveDatabaseTransaction(async (db) => {
    const now = new Date().toISOString();
    for (const key of [FIRST_RUN_ONBOARDING_KEY, FIRST_RUN_NOTIFICATION_PRIMER_KEY]) {
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, 'false', ?)
         ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = excluded.updated_at`,
        [key, now],
      );
    }
  }),
};

const repository = createFirstRunPreferenceRepository(storage);

export const loadFirstRunPreferences = repository.load;
export const completeOnboarding = repository.completeOnboarding;
export const markNotificationPrimerHandled = repository.markNotificationPrimerHandled;

export async function resetFirstRunPreferencesForDevelopment(): Promise<void> {
  if (!__DEV__) {
    throw new Error("First-run replay is available only in development builds.");
  }

  await repository.resetForDevelopment();
}
