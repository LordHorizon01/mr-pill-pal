export function toggleExpandedHistoryDate(currentDate: string | null, nextDate: string): string | null {
  return currentDate === nextDate ? null : nextDate;
}

export function resetExpandedHistoryDate(): null {
  return null;
}

export type AccordionGroup<T> = { date: string; label: string; data: T[] };
export type AccordionSection<T> = AccordionGroup<T> & { recordCount: number };

export function createHistoryAccordionSections<T>(groups: AccordionGroup<T>[], expandedDate: string | null): AccordionSection<T>[] {
  return groups.map((group) => ({
    ...group,
    recordCount: group.data.length,
    data: group.date === expandedDate ? group.data : [],
  }));
}
