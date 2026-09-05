import { getDatabase } from "@/database/database";

import {
  CreateMedicationInput,
  Medication,
  UpdateMedicationInput,
} from "./medication.types";

type MedicationRow = {
  id: string;
  name: string;
  dosage: string;
  instructions: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function mapMedicationRow(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    instructions: row.instructions ?? undefined,
    notes: row.notes ?? undefined,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createMedication(
  input: CreateMedicationInput
): Promise<Medication> {
  const db = await getDatabase();

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO medications
      (
        id,
        name,
        dosage,
        instructions,
        notes,
        is_active,
        created_at,
        updated_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.dosage,
      input.instructions ?? null,
      input.notes ?? null,
      1,
      now,
      now,
    ]
  );

  return {
    id,
    name: input.name,
    dosage: input.dosage,
    instructions: input.instructions,
    notes: input.notes,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getMedications(): Promise<Medication[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<MedicationRow>(
    `SELECT *
     FROM medications
     ORDER BY created_at DESC`
  );

  return rows.map(mapMedicationRow);
}

export async function getMedicationById(
  id: string
): Promise<Medication | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<MedicationRow>(
    `SELECT *
     FROM medications
     WHERE id = ?`,
    [id]
  );

  return row ? mapMedicationRow(row) : null;
}

export async function updateMedication(
  id: string,
  input: UpdateMedicationInput
): Promise<void> {
  const db = await getDatabase();

  const existing = await getMedicationById(id);

  if (!existing) {
    throw new Error("Medication not found.");
  }

  const updatedAt = new Date().toISOString();

  await db.runAsync(
    `UPDATE medications
     SET
       name = ?,
       dosage = ?,
       instructions = ?,
       notes = ?,
       is_active = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      input.name ?? existing.name,
      input.dosage ?? existing.dosage,
      input.instructions ?? existing.instructions ?? null,
      input.notes ?? existing.notes ?? null,
      (input.isActive ?? existing.isActive) ? 1 : 0,
      updatedAt,
      id,
    ]
  );
}

export async function deleteMedication(id: string): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM medications
     WHERE id = ?`,
    [id]
  );
}