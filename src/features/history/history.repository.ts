import { runDatabaseOperation, runExclusiveDatabaseTransaction } from "@/database/database";
import { TodayDose, DoseStatus } from "@/features/doses/dose.types";
import { DailyInsight, DetailedInsights, HistoryQuery, InsightsSummary, MedicationInsight } from "./history.types";
import { canDeleteHistoryStatus } from "./history.domain";

type Row = {
  id: string; profile_id: string; medication_id: string; schedule_id: string; scheduled_date: string; scheduled_time: string;
  scheduled_at: string; status: DoseStatus; taken_at: string | null; notes: string | null;
  medication_name: string; medication_dosage: string; created_at: string; updated_at: string;
};

function map(row: Row): TodayDose {
  return { id: row.id, profileId: row.profile_id, medicationId: row.medication_id, scheduleId: row.schedule_id, scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time, scheduledAt: row.scheduled_at, status: row.status, takenAt: row.taken_at ?? undefined,
    notes: row.notes ?? undefined, medicationName: row.medication_name, medicationDosage: row.medication_dosage,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function queryHistory(profileId: string, query: HistoryQuery, today: string): Promise<TodayDose[]> {
  return runDatabaseOperation(async (db) => {
    const conditions = ["dose_records.profile_id = ?", "(dose_records.status <> 'pending' OR dose_records.scheduled_date <= ?)"];
    const params: (string | number)[] = [profileId, today];
    if (query.status && query.status !== "all") { conditions.push("dose_records.status = ?"); params.push(query.status); }
    if (query.medicationId) { conditions.push("dose_records.medication_id = ?"); params.push(query.medicationId); }
    if (query.fromDate) { conditions.push("dose_records.scheduled_date >= ?"); params.push(query.fromDate); }
    if (query.toDate) { conditions.push("dose_records.scheduled_date <= ?"); params.push(query.toDate); }
    params.push(query.limit ?? 100, query.offset ?? 0);
    const rows = await db.getAllAsync<Row>(`SELECT dose_records.*, COALESCE(dose_records.medication_name, medications.name, 'Medication unavailable') AS medication_name, COALESCE(dose_records.medication_dosage, medications.dosage, '') AS medication_dosage FROM dose_records LEFT JOIN medications ON medications.id = dose_records.medication_id WHERE ${conditions.join(" AND ")} ORDER BY dose_records.scheduled_date DESC, dose_records.scheduled_time DESC, dose_records.updated_at DESC LIMIT ? OFFSET ?`, params);
    return rows.map(map);
  });
}

export async function getHistoryDose(profileId: string, id: string): Promise<TodayDose | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<Row>(`SELECT dose_records.*, COALESCE(dose_records.medication_name, medications.name, 'Medication unavailable') AS medication_name, COALESCE(dose_records.medication_dosage, medications.dosage, '') AS medication_dosage FROM dose_records LEFT JOIN medications ON medications.id = dose_records.medication_id WHERE dose_records.id = ? AND dose_records.profile_id = ?`, [id, profileId]);
    return row ? map(row) : null;
  });
}

export async function deleteFinalizedHistoryDose(profileId: string, id: string): Promise<void> {
  await runExclusiveDatabaseTransaction(async (db) => {
    const dose = await db.getFirstAsync<Pick<Row, "status">>(
      `SELECT status FROM dose_records WHERE id = ? AND profile_id = ?`, [id, profileId],
    );
    if (!dose) throw new Error("History record not found.");
    if (!canDeleteHistoryStatus(dose.status)) throw new Error("Only completed history records can be deleted.");
    const result = await db.runAsync(
      `DELETE FROM dose_records WHERE id = ? AND profile_id = ? AND status IN ('taken', 'skipped', 'missed')`, [id, profileId],
    );
    if (result.changes !== 1) throw new Error("This history record changed before it could be deleted. Refresh and try again.");
  });
}

export async function getInsightsCounts(profileId: string, fromDate: string, toDate: string): Promise<InsightsSummary> {
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<{ status: DoseStatus; total: number }>(`SELECT status, COUNT(*) AS total FROM dose_records WHERE profile_id = ? AND scheduled_date >= ? AND scheduled_date <= ? AND status IN ('taken', 'skipped', 'missed') GROUP BY status`, [profileId, fromDate, toDate]);
    return rows.reduce<InsightsSummary>((summary, row) => ({ ...summary, [row.status]: row.total }), { taken: 0, skipped: 0, missed: 0 });
  });
}

function emptySummary(): InsightsSummary { return { taken: 0, skipped: 0, missed: 0 }; }
function applyCounts<T extends InsightsSummary>(target: T, status: DoseStatus, total: number): T { if (status === "taken" || status === "skipped" || status === "missed") target[status] = total; return target; }

export async function getDetailedInsights(profileId: string, fromDate: string | null, toDate: string, today: string): Promise<DetailedInsights> {
  return runDatabaseOperation(async (db) => {
    const range = fromDate ? "scheduled_date >= ? AND " : "";
    const params = fromDate ? [fromDate, toDate] : [toDate];
    const condition = `profile_id = ? AND ${range}scheduled_date <= ?`;
    params.unshift(profileId);
    const outcomeRows = await db.getAllAsync<{ status: DoseStatus; total: number }>(`SELECT status, COUNT(*) AS total FROM dose_records WHERE ${condition} AND status IN ('taken', 'skipped', 'missed') GROUP BY status`, params);
    const summary = outcomeRows.reduce<InsightsSummary>((result, row) => applyCounts(result, row.status, row.total), emptySummary());
    const unresolvedParams = fromDate ? [profileId, fromDate, toDate, today] : [profileId, toDate, today];
    const unresolved = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) AS total FROM dose_records WHERE ${condition} AND scheduled_date < ? AND status = 'pending'`, unresolvedParams);
    const medicationRows = await db.getAllAsync<{ medication_id: string; medication_name: string; status: DoseStatus; total: number }>(`SELECT medication_id, COALESCE(medication_name, 'Medication unavailable') AS medication_name, status, COUNT(*) AS total FROM dose_records WHERE ${condition} AND status IN ('taken', 'skipped', 'missed') GROUP BY medication_id, medication_name, status ORDER BY medication_name COLLATE NOCASE`, params);
    const medicationMap = new Map<string, MedicationInsight>();
    medicationRows.forEach((row) => { const item = medicationMap.get(row.medication_id) ?? { medicationId: row.medication_id, medicationName: row.medication_name, ...emptySummary() }; applyCounts(item, row.status, row.total); medicationMap.set(row.medication_id, item); });
    const trendRows = await db.getAllAsync<{ scheduled_date: string; status: DoseStatus; total: number }>(`SELECT scheduled_date, status, COUNT(*) AS total FROM dose_records WHERE ${condition} AND status IN ('taken', 'skipped', 'missed') GROUP BY scheduled_date, status ORDER BY scheduled_date ASC`, params);
    const trendMap = new Map<string, DailyInsight>();
    trendRows.forEach((row) => { const item = trendMap.get(row.scheduled_date) ?? { date: row.scheduled_date, ...emptySummary() }; applyCounts(item, row.status, row.total); trendMap.set(row.scheduled_date, item); });
    const finalized = summary.taken + summary.skipped + summary.missed;
    return { ...summary, eligible: finalized + (unresolved?.total ?? 0), unresolvedPast: unresolved?.total ?? 0, byMedication: [...medicationMap.values()], trend: [...trendMap.values()] };
  });
}
