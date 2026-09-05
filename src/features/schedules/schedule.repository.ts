import { getDatabase } from "@/database/database";

import {
  CreateScheduleInput,
  MedicationSchedule,
} from "./schedule.types";

type ScheduleRow = {
  id: string;
  medication_id: string;
  type: "one_time" | "recurring";
  time: string;
  start_date: string;
  end_date: string | null;
  repeat_days: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function mapScheduleRow(row: ScheduleRow): MedicationSchedule {
  return {
    id: row.id,
    medicationId: row.medication_id,
    type: row.type,
    time: row.time,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    repeatDays: row.repeat_days
      ? JSON.parse(row.repeat_days)
      : undefined,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSchedule(
  input: CreateScheduleInput
): Promise<MedicationSchedule> {
  const db = await getDatabase();

  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO schedules (
      id,
      medication_id,
      type,
      time,
      start_date,
      end_date,
      repeat_days,
      is_active,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.medicationId,
      input.type,
      input.time,
      input.startDate,
      input.endDate ?? null,
      input.repeatDays
        ? JSON.stringify(input.repeatDays)
        : null,
      1,
      now,
      now,
    ]
  );

  return {
    id,
    medicationId: input.medicationId,
    type: input.type,
    time: input.time,
    startDate: input.startDate,
    endDate: input.endDate,
    repeatDays: input.repeatDays,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getSchedulesByMedicationId(
  medicationId: string
): Promise<MedicationSchedule[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<ScheduleRow>(
    `SELECT *
     FROM schedules
     WHERE medication_id = ?
     ORDER BY time ASC`,
    [medicationId]
  );

  return rows.map(mapScheduleRow);
}

export async function getScheduleById(
  id: string
): Promise<MedicationSchedule | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<ScheduleRow>(
    `SELECT *
     FROM schedules
     WHERE id = ?`,
    [id]
  );

  return row ? mapScheduleRow(row) : null;
}

export async function setScheduleActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `UPDATE schedules
     SET is_active = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      isActive ? 1 : 0,
      new Date().toISOString(),
      id,
    ]
  );

  if (result.changes === 0) {
    throw new Error("Schedule not found.");
  }
}

export async function deleteSchedule(
  id: string
): Promise<void> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `DELETE FROM schedules
     WHERE id = ?`,
    [id]
  );

  if (result.changes === 0) {
    throw new Error("Schedule not found.");
  }
}