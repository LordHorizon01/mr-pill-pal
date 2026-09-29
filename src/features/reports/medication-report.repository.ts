import { runDatabaseOperation } from "@/database/database";

import {
  MedicationReportSource,
  MedicationReportSourceDose,
  MedicationReportSourceMedication,
  MedicationReportSourceProfile,
} from "./medication-report.types";

type ProfileRow = { id: string; full_name: string; nickname: string | null };
type MedicationRow = { id: string; profile_id: string; name: string; dosage: string; is_active: number; archived_at: string | null };
type DoseRow = {
  profile_id: string;
  medication_id: string;
  scheduled_date: string;
  status: MedicationReportSourceDose["status"];
  medication_name: string | null;
  medication_dosage: string | null;
};

/**
 * Gets all report input in a small number of explicitly profile-scoped reads.
 * It never generates, updates, or deletes records while a report is prepared.
 */
export async function getMedicationReportSource(profileId: string, startDate: string, endDate: string): Promise<MedicationReportSource> {
  return runDatabaseOperation(async (db) => {
    const profileRow = await db.getFirstAsync<ProfileRow>(
      `SELECT id, full_name, nickname FROM local_profiles WHERE id = ? AND deleted_at IS NULL`,
      [profileId],
    );
    const medicationRows = await db.getAllAsync<MedicationRow>(
      `SELECT id, profile_id, name, dosage, is_active, archived_at FROM medications WHERE profile_id = ? ORDER BY name COLLATE NOCASE ASC, id ASC`,
      [profileId],
    );
    const doseRows = await db.getAllAsync<DoseRow>(
      `SELECT profile_id, medication_id, scheduled_date, status, medication_name, medication_dosage FROM dose_records WHERE profile_id = ? AND scheduled_date >= ? AND scheduled_date <= ? ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC`,
      [profileId, startDate, endDate],
    );

    const profile: MedicationReportSourceProfile | null = profileRow ? { id: profileRow.id, fullName: profileRow.full_name, nickname: profileRow.nickname ?? undefined } : null;
    const medications: MedicationReportSourceMedication[] = medicationRows.map((row) => ({ id: row.id, profileId: row.profile_id, name: row.name, dosage: row.dosage, isActive: row.is_active === 1, archivedAt: row.archived_at ?? undefined }));
    const doses: MedicationReportSourceDose[] = doseRows.map((row) => ({ profileId: row.profile_id, medicationId: row.medication_id, scheduledDate: row.scheduled_date, status: row.status, medicationName: row.medication_name ?? undefined, medicationDosage: row.medication_dosage ?? undefined }));
    return { profile, medications, doses };
  });
}
