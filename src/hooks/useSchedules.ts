import { useScheduleStore } from "@/state/schedule.store";

export function useSchedules() {
  const schedules = useScheduleStore(
    (state) => state.schedules
  );

  const isLoading = useScheduleStore(
    (state) => state.isLoading
  );

  const error = useScheduleStore(
    (state) => state.error
  );

  const loadSchedules = useScheduleStore(
    (state) => state.loadSchedules
  );

  const createSchedule = useScheduleStore(
    (state) => state.createSchedule
  );

  const pauseSchedule = useScheduleStore(
    (state) => state.pauseSchedule
  );

  const resumeSchedule = useScheduleStore(
    (state) => state.resumeSchedule
  );

  const deleteSchedule = useScheduleStore(
    (state) => state.deleteSchedule
  );

  const clearSchedules = useScheduleStore(
    (state) => state.clearSchedules
  );

  const clearError = useScheduleStore(
    (state) => state.clearError
  );

  return {
    schedules,
    isLoading,
    error,
    loadSchedules,
    createSchedule,
    pauseSchedule,
    resumeSchedule,
    deleteSchedule,
    clearSchedules,
    clearError,
  };
}