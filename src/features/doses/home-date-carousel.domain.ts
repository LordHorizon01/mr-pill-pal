import { addDaysToLocalDate, parseLocalDate, validateLocalDate } from "./dose.domain";

export const HOME_DATE_CAROUSEL_DAYS_EACH_SIDE = 90;

/** Builds a bounded, local-calendar range with today at its stable center index. */
export function getHomeDateCarouselDates(
  todayDate: string,
  daysEachSide = HOME_DATE_CAROUSEL_DAYS_EACH_SIDE,
): string[] {
  const today = validateLocalDate(todayDate);
  const range = Math.max(0, Math.floor(daysEachSide));
  return Array.from({ length: range * 2 + 1 }, (_, index) =>
    addDaysToLocalDate(today, index - range),
  );
}

export function getHomeDateCarouselIndex(
  date: string,
  todayDate: string,
  daysEachSide = HOME_DATE_CAROUSEL_DAYS_EACH_SIDE,
): number {
  const selectedDate = validateLocalDate(date);
  const today = validateLocalDate(todayDate);
  const selectedUtc = Date.UTC(parseLocalDate(selectedDate).getFullYear(), parseLocalDate(selectedDate).getMonth(), parseLocalDate(selectedDate).getDate());
  const todayLocal = parseLocalDate(today);
  const todayUtc = Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate());
  const index = Math.round((selectedUtc - todayUtc) / 86_400_000) + Math.max(0, Math.floor(daysEachSide));
  const count = Math.max(0, Math.floor(daysEachSide)) * 2 + 1;
  if (index < 0 || index >= count) throw new RangeError("Date is outside the Home carousel range.");
  return index;
}

export function getHomeDateIndexFromOffset(offset: number, itemStride: number, itemCount: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(itemStride) || itemStride <= 0 || itemCount <= 0) return 0;
  return Math.max(0, Math.min(itemCount - 1, Math.round(offset / itemStride)));
}

export function getHomeDateOffsetForIndex(index: number, itemStride: number): number {
  return Math.max(0, index) * Math.max(0, itemStride);
}

export function isHomeDateToday(date: string, todayDate: string): boolean {
  return validateLocalDate(date) === validateLocalDate(todayDate);
}
