export function getNextDoseEmptyMessage(input: {
  doseDataReady: boolean;
  hasError: boolean;
  hasUpcomingDose: boolean;
  selectedDate: string;
  todayDate: string;
}): string | null {
  if (!input.doseDataReady || input.hasError || input.hasUpcomingDose) return null;

  return input.selectedDate === input.todayDate
    ? "No more medications scheduled for today."
    : "No medications scheduled for this day.";
}
