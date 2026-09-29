import { formatStockQuantity, getStockHistoryEventLabel } from "./refill.domain";
import { StockHistoryEvent } from "./refill.types";

export type StockHistoryPresentation = {
  label: string;
  delta: string;
  change: string;
  hasUnitSnapshot: boolean;
};

export function getStockHistoryPresentation(event: StockHistoryEvent): StockHistoryPresentation {
  const unit = event.unitSnapshot;
  const sign = event.quantityDelta > 0 ? "+" : "";
  const quantities = unit
    ? `${formatStockQuantity(event.quantityBefore, unit)} -> ${formatStockQuantity(event.quantityAfter, unit)}`
    : `${event.quantityBefore} -> ${event.quantityAfter} (unit not saved for this older event)`;

  return {
    label: getStockHistoryEventLabel(event.type),
    delta: unit ? `${sign}${formatStockQuantity(event.quantityDelta, unit)}` : `${sign}${event.quantityDelta}`,
    change: quantities,
    hasUnitSnapshot: Boolean(unit),
  };
}

export function sortStockHistoryNewestFirst(events: readonly StockHistoryEvent[]): StockHistoryEvent[] {
  return [...events].sort((first, second) => second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id));
}
