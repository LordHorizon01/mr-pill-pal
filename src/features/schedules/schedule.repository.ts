import { runDatabaseOperation } from "@/database/database";

import {
  CreateScheduleInput,
  MedicationSchedule,
  ReminderStatus,
} from "./schedule.types";

type ScheduleRow = {
  id: string;
  medication_id: string;
  type: "one_time" | "recurring";
  time: string;
  start_date: string;
  end_date: string | null;
  repeat_days: string | null;
  notification_id: string | null;
  notification_ids: string | null;
  is_active: number;
  reminder_status: ReminderStatus | null;
  created_at: string;
  updated_at: string;
};

function parseNotificationIds(
  notificationIds: string | null,
  notificationId: string | null,
): string[] | undefined {
  if (notificationIds) {
    try {
      const parsed = JSON.parse(notificationIds);

      if (
        Array.isArray(parsed) &&
        parsed.every((id) => typeof id === "string")
      ) {
        return parsed;
      }
    } catch {
      // Fall back to the old single notification ID.
    }
  }

  return notificationId ? [notificationId] : undefined;
}

function mapScheduleRow(row: ScheduleRow): MedicationSchedule {
  return {
    id: row.id,
    medicationId: row.medication_id,
    type: row.type,
    time: row.time,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    repeatDays: row.repeat_days ? JSON.parse(row.repeat_days) : undefined,
    notificationId: row.notification_id ?? undefined,
    notificationIds: parseNotificationIds(
      row.notification_ids,
      row.notification_id,
    ),
    isActive: row.is_active === 1,
    reminderStatus:
      row.reminder_status ?? (row.is_active === 1 ? "active" : "paused"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSchedule(
  input: CreateScheduleInput,
): Promise<MedicationSchedule> {
  const id = generateId();
  const now = new Date().toISOString();

  return runDatabaseOperation(async (db) => {
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
      reminder_status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.medicationId,
      input.type,
      input.time,
      input.startDate,
      input.endDate ?? null,
      input.repeatDays ? JSON.stringify(input.repeatDays) : null,
      1,
      "active",
      now,
      now,
      ],
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
      reminderStatus: "active",
      createdAt: now,
      updatedAt: now,
    };
  });
}

export async function getSchedulesByMedicationId(
  medicationId: string,
): Promise<MedicationSchedule[]> {
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<ScheduleRow>(
      `SELECT *
     FROM schedules
     WHERE medication_id = ?
     ORDER BY time ASC`,
      [medicationId],
    );

    return rows.map(mapScheduleRow);
  });
}

export async function getActiveSchedules(): Promise<MedicationSchedule[]> {
  return runDatabaseOperation(async (db) => {
    const rows = await db.getAllAsync<ScheduleRow>(
      `SELECT *
     FROM schedules
     WHERE is_active = 1
     ORDER BY time ASC`,
    );

    return rows.map(mapScheduleRow);
  });
}

export async function getScheduleById(
  id: string,
): Promise<MedicationSchedule | null> {
  return runDatabaseOperation(async (db) => {
    const row = await db.getFirstAsync<ScheduleRow>(
      `SELECT *
     FROM schedules
     WHERE id = ?`,
      [id],
    );

    return row ? mapScheduleRow(row) : null;
  });
}

export async function setScheduleNotificationId(
  id: string,
  notificationId: string | null,
): Promise<void> {
  await runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `UPDATE schedules
     SET notification_id = ?,
         updated_at = ?
     WHERE id = ?`,
      [notificationId, new Date().toISOString(), id],
    );

    if (result.changes === 0) {
      throw new Error("Schedule not found.");
    }
  });
}

export async function setScheduleNotificationIds(
  id: string,
  notificationIds: string[],
): Promise<void> {
  await runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `UPDATE schedules
     SET notification_ids = ?,
         notification_id = NULL,
         updated_at = ?
     WHERE id = ?`,
      [
        notificationIds.length > 0 ? JSON.stringify(notificationIds) : null,
        new Date().toISOString(),
        id,
      ],
    );

    if (result.changes === 0) {
      throw new Error("Schedule not found.");
    }
  });
}

export async function setScheduleActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `UPDATE schedules
     SET is_active = ?,
         reminder_status = ?,
         updated_at = ?
     WHERE id = ?`,
      [
        isActive ? 1 : 0,
        isActive ? "active" : "paused",
        new Date().toISOString(),
        id,
      ],
    );

    if (result.changes === 0) {
      throw new Error("Schedule not found.");
    }
  });
}

export async function setScheduleReminderState(
  id: string,
  reminderStatus: ReminderStatus,
  notificationIds: string[] = [],
): Promise<void> {
  const isActive = reminderStatus === "active";

  await runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `UPDATE schedules
     SET is_active = ?,
         reminder_status = ?,
         notification_ids = ?,
         notification_id = NULL,
         updated_at = ?
     WHERE id = ?`,
      [
        isActive ? 1 : 0,
        reminderStatus,
        notificationIds.length > 0 ? JSON.stringify(notificationIds) : null,
        new Date().toISOString(),
        id,
      ],
    );

    if (result.changes === 0) {
      throw new Error("Schedule not found.");
    }
  });
}

export async function deleteSchedule(id: string): Promise<void> {
  await runDatabaseOperation(async (db) => {
    const result = await db.runAsync(
      `DELETE FROM schedules
     WHERE id = ?`,
      [id],
    );

    if (result.changes === 0) {
      throw new Error("Schedule not found.");
    }
  });
}
