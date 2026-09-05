import { create } from "zustand";

import {
  addSchedule,
  getMedicationSchedules,
  pauseSchedule as pauseScheduleService, 
  removeSchedule,
  resumeSchedule as resumeScheduleService,
} from "@/features/schedules/schedule.service";

import {
  CreateScheduleInput,
  MedicationSchedule,
} from "@/features/schedules/schedule.types";

interface ScheduleState {
  schedules: MedicationSchedule[];
  isLoading: boolean;
  error: string | null;

  loadSchedules: (medicationId: string) => Promise<void>;

  createSchedule: (
    input: CreateScheduleInput
  ) => Promise<MedicationSchedule>;

  pauseSchedule: (id: string) => Promise<void>;

  resumeSchedule: (id: string) => Promise<void>;

  deleteSchedule: (id: string) => Promise<void>;

  clearSchedules: () => void;

  clearError: () => void;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedules: [],
  isLoading: false,
  error: null,

  loadSchedules: async (medicationId) => {
    set({
      isLoading: true,
      error: null,
    });

    try {
      const schedules =
        await getMedicationSchedules(medicationId);

      set({
        schedules,
        isLoading: false,
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to load schedules.",
        isLoading: false,
      });
    }
  },

  createSchedule: async (input) => {
    set({ error: null });

    try {
      const schedule = await addSchedule(input);

      set((state) => ({
        schedules: [...state.schedules, schedule].sort(
          (a, b) => a.time.localeCompare(b.time)
        ),
      }));

      return schedule;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create schedule.";

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
                updatedAt: new Date().toISOString(),
              }
            : schedule
        ),
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to pause schedule.";

      set({ error: message });

      throw error;
    }
  },

  resumeSchedule: async (id) => {
    set({ error: null });

    try {
      await resumeScheduleService(id);

      set((state) => ({
        schedules: state.schedules.map((schedule) =>
          schedule.id === id
            ? {
                ...schedule,
                isActive: true,
                updatedAt: new Date().toISOString(),
              }
            : schedule
        ),
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resume schedule.";

      set({ error: message });

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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete schedule.";

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

  clearError: () => {
    set({ error: null });
  },
}));