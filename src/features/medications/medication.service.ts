import {
  createMedication,
  deleteMedication,
  getMedicationById,
  getMedications,
  updateMedication,
} from "./medication.repository";

import {
  CreateMedicationInput,
  Medication,
  UpdateMedicationInput,
} from "./medication.types";

function validateMedicationName(name: string): string {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Medication name is required.");
  }

  if (trimmedName.length > 100) {
    throw new Error("Medication name must be 100 characters or fewer.");
  }

  return trimmedName;
}

function validateDosage(dosage: string): string {
  const trimmedDosage = dosage.trim();

  if (!trimmedDosage) {
    throw new Error("Dosage is required.");
  }

  if (trimmedDosage.length > 100) {
    throw new Error("Dosage must be 100 characters or fewer.");
  }

  return trimmedDosage;
}

function cleanOptionalText(value?: string): string | undefined {
  const cleaned = value?.trim();

  return cleaned ? cleaned : undefined;
}

export async function addMedication(
  input: CreateMedicationInput
): Promise<Medication> {
  const validatedInput: CreateMedicationInput = {
    name: validateMedicationName(input.name),
    dosage: validateDosage(input.dosage),
    instructions: cleanOptionalText(input.instructions),
    notes: cleanOptionalText(input.notes),
  };

  return createMedication(validatedInput);
}

export async function getAllMedications(): Promise<Medication[]> {
  return getMedications();
}

export async function getMedication(
  id: string
): Promise<Medication | null> {
  if (!id.trim()) {
    throw new Error("Medication ID is required.");
  }

  return getMedicationById(id);
}

export async function editMedication(
  id: string,
  input: UpdateMedicationInput
): Promise<void> {
  if (!id.trim()) {
    throw new Error("Medication ID is required.");
  }

  const validatedInput: UpdateMedicationInput = {};

  if (input.name !== undefined) {
    validatedInput.name = validateMedicationName(input.name);
  }

  if (input.dosage !== undefined) {
    validatedInput.dosage = validateDosage(input.dosage);
  }

  if (input.instructions !== undefined) {
    validatedInput.instructions = cleanOptionalText(input.instructions);
  }

  if (input.notes !== undefined) {
    validatedInput.notes = cleanOptionalText(input.notes);
  }

  if (input.isActive !== undefined) {
    validatedInput.isActive = input.isActive;
  }

  await updateMedication(id, validatedInput);
}

export async function removeMedication(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("Medication ID is required.");
  }

  const medication = await getMedicationById(id);

  if (!medication) {
    throw new Error("Medication not found.");
  }

  await deleteMedication(id);
}