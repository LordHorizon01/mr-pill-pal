import { archiveMedication, createMedication, deleteMedication, getMedicationById, getMedications, restoreMedication, updateMedication } from "./medication.repository";
import { CreateMedicationInput, Medication, MedicationListFilter, UpdateMedicationInput } from "./medication.types";
import { hasMedicationChanges } from "./medication.domain";
import { getSchedulesByMedicationId } from "@/features/schedules/schedule.repository";
import { cancelScheduledNotifications } from "@/notifications/notification.service";
import { deletePendingDosesForScheduleFromDate } from "@/features/doses/dose.repository";
import { toLocalDateString } from "@/features/doses/dose.domain";
import { pauseSchedule, refreshMedicationReminders } from "@/features/schedules/schedule.service";

function clean(value?: string): string | undefined { const text = value?.trim(); return text || undefined; }
function validate(input: CreateMedicationInput): CreateMedicationInput { const name = clean(input.name); const dosage = clean(input.dosage); if (!name || name.length > 100) throw new Error("Medication name is required and must be 100 characters or fewer."); if (!dosage || dosage.length > 100) throw new Error("Dosage is required and must be 100 characters or fewer."); return { name, dosage, instructions: clean(input.instructions), notes: clean(input.notes) }; }
function ids(schedules: Awaited<ReturnType<typeof getSchedulesByMedicationId>>): string[] { return [...new Set(schedules.flatMap((schedule) => schedule.notificationIds?.length ? schedule.notificationIds : schedule.notificationId ? [schedule.notificationId] : []))]; }

export async function addMedication(profileId: string, input: CreateMedicationInput): Promise<Medication> { return createMedication(profileId, validate(input)); }
export async function getAllMedications(profileId: string, filter: MedicationListFilter = "active"): Promise<Medication[]> { return getMedications(profileId, filter); }
export async function getMedication(profileId: string, id: string): Promise<Medication | null> { if (!id.trim()) throw new Error("Medication ID is required."); return getMedicationById(profileId, id); }
export async function editMedication(profileId: string, id: string, input: UpdateMedicationInput): Promise<void> {
  const medication = await getMedicationById(profileId, id); if (!medication) throw new Error("Medication not found."); const normalized: UpdateMedicationInput = { ...input, ...(input.name !== undefined ? { name: validate({ name: input.name, dosage: medication.dosage }).name } : {}), ...(input.dosage !== undefined ? { dosage: validate({ name: medication.name, dosage: input.dosage }).dosage } : {}), ...(input.instructions !== undefined ? { instructions: clean(input.instructions) } : {}), ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}) };
  if (!hasMedicationChanges(medication, normalized)) return; await updateMedication(profileId, id, normalized); if (normalized.name && normalized.name !== medication.name) await refreshMedicationReminders(id, normalized.name);
}
export async function removeMedication(profileId: string, id: string): Promise<void> { const medication = await getMedicationById(profileId, id); if (!medication) throw new Error("Medication not found."); const schedules = await getSchedulesByMedicationId(profileId, id); const notificationIds = ids(schedules); if (notificationIds.length) { try { await cancelScheduledNotifications(notificationIds); } catch { throw new Error("Could not stop all reminders, so this medication was not deleted. Please try again."); } } for (const schedule of schedules) await deletePendingDosesForScheduleFromDate(schedule.id, toLocalDateString()); await deleteMedication(profileId, id); }
export async function archiveMedicationSafely(profileId: string, id: string): Promise<void> { const medication = await getMedicationById(profileId, id); if (!medication) throw new Error("Medication not found."); for (const schedule of await getSchedulesByMedicationId(profileId, id)) if (schedule.isActive) await pauseSchedule(schedule.id); await archiveMedication(profileId, id); }
export async function restoreMedicationSafely(profileId: string, id: string): Promise<void> { await restoreMedication(profileId, id); }
