import { runDatabaseOperation, runExclusiveDatabaseTransaction } from "@/database/database";
import { CreateProfileInput, Profile } from "./profile.types";

type ProfileRow = {
  id: string; account_uid: string; full_name: string; nickname: string | null; date_of_birth: string;
  relationship: Profile["relationship"]; avatar_url: string | null; medical_details_json: string | null;
  role: Profile["role"]; is_active: number; deleted_at: string | null; created_at: string; updated_at: string;
};

type PendingProfileCreation = {
  profileId: string;
  input: CreateProfileInput;
};

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id, accountUid: row.account_uid, fullName: row.full_name, nickname: row.nickname ?? undefined,
    dateOfBirth: row.date_of_birth, relationship: row.relationship, avatarUrl: row.avatar_url ?? undefined,
    medicalDetails: row.medical_details_json ? JSON.parse(row.medical_details_json) : undefined,
    role: row.role, accessLevel: "OWNER", isActive: row.is_active === 1, deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function saveLocalProfile(profile: Profile): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(`INSERT INTO local_profiles (id, account_uid, full_name, nickname, date_of_birth, relationship, avatar_url, medical_details_json, role, is_active, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET account_uid=excluded.account_uid, full_name=excluded.full_name, nickname=excluded.nickname, date_of_birth=excluded.date_of_birth, relationship=excluded.relationship, avatar_url=excluded.avatar_url, medical_details_json=excluded.medical_details_json, role=excluded.role, is_active=excluded.is_active, deleted_at=excluded.deleted_at, updated_at=excluded.updated_at`,
    [profile.id, profile.accountUid, profile.fullName, profile.nickname ?? null, profile.dateOfBirth, profile.relationship,
      profile.avatarUrl ?? null, profile.medicalDetails ? JSON.stringify(profile.medicalDetails) : null, profile.role,
      profile.isActive ? 1 : 0, profile.deletedAt ?? null, profile.createdAt, profile.updatedAt]);
  });
}

export async function getLocalProfiles(accountUid: string, includeInactive = false): Promise<Profile[]> {
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<ProfileRow>(`SELECT * FROM local_profiles WHERE account_uid = ? ${includeInactive ? "" : "AND is_active = 1 AND deleted_at IS NULL"} ORDER BY updated_at DESC`, [accountUid]);
    return rows.map(mapProfile);
  });
}

export async function getLocalProfile(accountUid: string, profileId: string): Promise<Profile | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<ProfileRow>(`SELECT * FROM local_profiles WHERE id = ? AND account_uid = ? AND deleted_at IS NULL`, [profileId, accountUid]);
    return row ? mapProfile(row) : null;
  });
}

export async function getLocalProfileById(profileId: string): Promise<Profile | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<ProfileRow>(`SELECT * FROM local_profiles WHERE id = ? AND deleted_at IS NULL`, [profileId]);
    return row ? mapProfile(row) : null;
  });
}

export async function hasLegacyUnassignedData(): Promise<boolean> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<{ total: number }>(`SELECT (SELECT COUNT(*) FROM medications WHERE profile_id IS NULL) + (SELECT COUNT(*) FROM schedules WHERE profile_id IS NULL) + (SELECT COUNT(*) FROM dose_records WHERE profile_id IS NULL) AS total`);
    return (row?.total ?? 0) > 0;
  });
}

export async function adoptLegacyData(profileId: string): Promise<void> {
  await runExclusiveDatabaseTransaction(async (db) => {
    await db.runAsync(`UPDATE medications SET profile_id = ?, updated_at = ? WHERE profile_id IS NULL`, [profileId, new Date().toISOString()]);
    await db.runAsync(`UPDATE schedules SET profile_id = ?, updated_at = ? WHERE profile_id IS NULL`, [profileId, new Date().toISOString()]);
    await db.runAsync(`UPDATE dose_records SET profile_id = ?, updated_at = ? WHERE profile_id IS NULL`, [profileId, new Date().toISOString()]);
  });
}

export async function getSelectedProfileId(accountUid: string): Promise<string | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_settings WHERE key = ?`, [`selected_profile_id:${accountUid}`]);
    return row?.value ?? null;
  });
}

export async function saveSelectedProfileId(accountUid: string, profileId: string | null): Promise<void> {
  await runDatabaseOperation(async (db) => {
    const key = `selected_profile_id:${accountUid}`;
    if (!profileId) { await db.runAsync(`DELETE FROM app_settings WHERE key = ?`, [key]); return; }
    await db.runAsync(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [key, profileId, new Date().toISOString()]);
  });
}

export async function getPendingProfileCreation(accountUid: string): Promise<PendingProfileCreation | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_settings WHERE key = ?`, [`pending_profile_creation:${accountUid}`]);
    if (!row?.value) return null;
    try {
      const pending = JSON.parse(row.value) as PendingProfileCreation;
      return pending.profileId && pending.input ? pending : null;
    } catch {
      return null;
    }
  });
}

export async function savePendingProfileCreation(accountUid: string, pending: PendingProfileCreation): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [`pending_profile_creation:${accountUid}`, JSON.stringify(pending), new Date().toISOString()]);
  });
}

export async function clearPendingProfileCreation(accountUid: string): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(`DELETE FROM app_settings WHERE key = ?`, [`pending_profile_creation:${accountUid}`]);
  });
}

export async function getLegacyAdoptionDeferred(accountUid: string): Promise<boolean> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_settings WHERE key = ?`, [`legacy_adoption_deferred:${accountUid}`]);
    return row?.value === "true";
  });
}

export async function saveLegacyAdoptionDeferred(accountUid: string): Promise<void> {
  await runDatabaseOperation(async (db) => {
    await db.runAsync(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, 'true', ?) ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = excluded.updated_at`, [`legacy_adoption_deferred:${accountUid}`, new Date().toISOString()]);
  });
}
