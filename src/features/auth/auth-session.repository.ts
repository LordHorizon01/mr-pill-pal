import { runDatabaseOperation, runExclusiveDatabaseTransaction } from "@/database/database";

const setupProgressKey = (accountUid: string) => `account_profile_setup_progress:${accountUid}`;

export async function getCachedAccountProfileSetupProgress(accountUid: string): Promise<string | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = ?",
      [setupProgressKey(accountUid)],
    );
    return row?.value ?? null;
  });
}

export async function saveCachedAccountProfileSetupProgress(accountUid: string, value: string): Promise<void> {
  await runExclusiveDatabaseTransaction(async (db) => {
    const key = setupProgressKey(accountUid);
    const current = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
    let currentIsComplete = false;
    let incomingIsComplete = false;
    try { currentIsComplete = JSON.parse(current?.value ?? "null")?.state === "COMPLETED"; } catch { /* Replace malformed local cache. */ }
    try { incomingIsComplete = JSON.parse(value)?.state === "COMPLETED"; } catch { /* The service only writes validated setup records. */ }
    if (currentIsComplete && !incomingIsComplete) return;
    await db.runAsync(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, new Date().toISOString()],
    );
  });
}
