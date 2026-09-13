import { create } from "zustand";
import { getSafeDatabaseErrorMessage } from "@/database/database";

import {
  addSchedule,
  getMedicationSchedules,
  getReminderStatusForError,
  pauseSchedule as pauseScheduleService, 
  removeSchedule,
  resumeSchedule as resumeScheduleService,
  updateMedicationSchedule,
} from "@/features/schedules/schedule.service";

import {
  CreateScheduleInput,
  MedicationSchedule,
  UpdateScheduleInput,
} from "@/features/schedules/schedule.types";
import { createAsyncRequestGuard } from "@/state/async-request.domain";

const scheduleLoadGuard = createAsyncRequestGuard();

interface ScheduleState {
  profileId: string | null;
  schedules: MedicationSchedule[];
  isLoading: boolean;
  error: string | null;

  loadSchedules: (medicationId: string) => Promise<void>;

  createSchedule: (
    input: CreateScheduleInput
  ) => Promise<MedicationSchedule>;

  pauseSchedule: (id: string) => Promise<void>;

  resumeSchedule: (id: string) => Promise<void>;

  updateSchedule: (id: string, input: UpdateScheduleInput) => Promise<MedicationSchedule>;

  deleteSchedule: (id: string) => Promise<void>;

  clearSchedules: () => void;
  setProfile: (profileId: string | null) => void;

  clearError: () => void;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  profileId: null,
  schedules: [],
  isLoading: false,
  error: null,

  loadSchedules: async (medicationId) => {
    const requestRevision = scheduleLoadGuard.begin();
    set({
      isLoading: true,
      error: null,
    });

    try {
      const schedules =
        await getMedicationSchedules(medicationId);

      if (!scheduleLoadGuard.isCurrent(requestRevision)) return;

      set({
        schedules,
        isLoading: false,
      });
    } catch (error) {
      if (!scheduleLoadGuard.isCurrent(requestRevision)) return;
      set({
        error: getSafeDatabaseErrorMessage(
          error,
          "Could not load reminders right now. Please try again.",
        ),
        isLoading: false,
      });
    }
  },

  createSchedule: async (input) => {
    set({ error: null });

    try {
      const schedule = await addSchedule(input);

      set((state) => ({
        schedules: state.schedules.some(
          (existingSchedule) => existingSchedule.id === schedule.id,
        )
          ? state.schedules
          : [...state.schedules, schedule].sort(
              (a, b) => a.time.localeCompare(b.time),
            ),
        error:
          schedule.reminderStatus === "permission_required"
            ? "Schedule saved, but notifications are disabled. Enable them, then try again."
            : schedule.reminderStatus === "scheduling_failed"
              ? "Schedule saved, but the reminder setup failed. Tap Retry to try again."
              : null,
      }));

      return schedule;
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not save this reminder. Please try again.",
      );

      set({ error: message });

      throw error;
    }
  },

  pauseSchedule: async (id) => {
    set({ error: null });

    try {
      await pauseScheduleService(id);

      set((state) => ({
        schedules: state.schedules.map((schedule) =>
          schedule.id === id
            ? {
                ...schedule,
                isActive: false,
                notificationId: undefined,
                notificationIds: undefined,
                reminderStatus: "paused",
                updatedAt: new Date().toISOString(),
              }
            : schedule
        ),
      }));
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not pause this reminder. Please try again.",
      );

      set({ error: message });

      throw error;
    }
  },

  resumeSchedule: async (id) => {
    set({ error: null });

    try {
      const notificationIds = await resumeScheduleService(id);

      set((state) => ({
        schedules: state.schedules.map((schedule) =>
          schedule.id === id
            ? {
                ...schedule,
                isActive: true,
                notificationId: undefined,
                notificationIds,
                reminderStatus: "active",
                updatedAt: new Date().toISOString(),
              }
            : schedule
        ),
      }));
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not update this reminder. Please try again.",
      );

      const reminderStatus = getReminderStatusForError(error);

      set((state) => ({
        schedules: state.schedules.map((schedule) =>
          schedule.id === id
            ? {
                ...schedule,
                isActive: false,
                notificationId: undefined,
                notificationIds: undefined,
                reminderStatus,
                updatedAt: new Date().toISOString(),
              }
            : schedule,
        ),
        error: message,
      }));

      throw error;
    }
  },

  updateSchedule: async (id, input) => {
    set({ error: null });
    const existing = get().schedules.find((schedule) => schedule.id === id);

    try {
      const updatedSchedule = await updateMedicationSchedule(id, input);
      set((state) => ({
        schedules: state.schedules
          .map((schedule) => schedule.id === id ? updatedSchedule : schedule)
          .sort((a, b) => a.time.localeCompare(b.time)),
      }));
      return updatedSchedule;
    } catch (error) {
      if (existing) {
        try {
          const schedules = await getMedicationSchedules(existing.medicationId);
          set({ schedules });
        } catch {
          // Keep the original edit error as the message shown to the user.
        }
      }

      set({
        error: getSafeDatabaseErrorMessage(
          error,
          "Could not update this reminder. Please try again.",
        ),
      });
      throw error;
    }
  },

  deleteSchedule: async (id) => {
    set({ error: null });

    try {
      await removeSchedule(id);

      set((state) => ({
        schedules: state.schedules.filter(
          (schedule) => schedule.id !== id
        ),
      }));
    } catch (error) {
      const message = getSafeDatabaseErrorMessage(
        error,
        "Could not delete this reminder. Please try again.",
      );

      set({ error: message });

      throw error;
    }
  },

  clearSchedules: () => {
    set({
      schedules: [],
      error: null,
    });
  },
  setProfile: (profileId) => { scheduleLoadGuard.invalidate(); set({ profileId, schedules: [], error: null, isLoading: false }); },

  clearError: () => {
    set({ error: null });
  },
}));
