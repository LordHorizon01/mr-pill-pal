import { Medication } from "./medication.types";

export const MEDICATION_SEARCH_SUGGESTION_LIMIT = 5;
export const MEDICATION_SEARCH_JUMP_HIGHLIGHT_DURATION_MS = 1_800;
export const MEDICATION_ALPHA_INDEX_MIN_ITEMS = 12;
export const MEDICATION_ALPHA_INDEX_MIN_BUCKETS = 4;
/**
 * A visual rail with more entries would either create overlapping touch
 * targets or clip on smaller phones. Search and the normal list remain
 * available when this compact shortcut is intentionally hidden.
 */
export const MEDICATION_ALPHA_INDEX_MAX_BUCKETS = 8;

export type MedicationAlphabetBucket = "#" | string;
export type MedicationLifecycleFilter = "active" | "paused" | "archived";
export type MedicationAlphabetViewableItem = Readonly<{
  item: Pick<Medication, "name">;
  index: number | null;
  isViewable: boolean;
}>;
export type MedicationSearchJumpRequest = Readonly<{
  medicationId: string;
  nextSearchQuery: "";
}>;
export type MedicationSearchJumpTarget = Readonly<{
  medicationId: string;
  index: number;
}>;
export type MedicationSearchJumpScrollPlan = Readonly<{
  medicationId: string;
  index: number;
  strategy: "index" | "end";
}>;

/**
 * Produces the stable, local-only form used by the medication list search.
 * Collapsing whitespace means that a user can type naturally without missing
 * a medicine because of an accidental extra space.
 */
export function normalizeMedicationSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Searches the medication group already loaded for the current profile.
 * It deliberately does not query schedules, history, or SQLite.
 */
export function filterMedicationsBySearch(
  medications: Medication[],
  query: string,
): Medication[] {
  const normalizedQuery = normalizeMedicationSearchQuery(query);

  if (!normalizedQuery) {
    return medications.slice();
  }

  return medications.filter((medication) =>
    normalizeMedicationSearchQuery(medication.name).includes(normalizedQuery),
  );
}

/** Keeps a prior lifecycle query result from leaking into the newly selected group. */
export function filterMedicationsByLifecycle(
  medications: Medication[],
  lifecycle: MedicationLifecycleFilter,
): Medication[] {
  return medications.filter((medication) => {
    if (lifecycle === "archived") return Boolean(medication.archivedAt);
    if (medication.archivedAt) return false;
    return lifecycle === "active" ? medication.isActive : !medication.isActive;
  });
}

/**
 * Returns a new, case-insensitively sorted list without changing the
 * medication order held by the store. Equal normalized names keep their
 * original relative order, which makes the result stable.
 */
export function sortMedicationsAlphabetically(
  medications: Medication[],
): Medication[] {
  return medications
    .map((medication, index) => ({ medication, index }))
    .sort((left, right) => {
      const leftName = normalizeMedicationSearchQuery(left.medication.name);
      const rightName = normalizeMedicationSearchQuery(right.medication.name);
      const comparison = leftName.localeCompare(rightName);

      return comparison || left.index - right.index;
    })
    .map(({ medication }) => medication);
}

export function getMedicationAlphabetBucket(
  medicationName: string,
): MedicationAlphabetBucket {
  const firstCharacter = medicationName.trim().charAt(0).toUpperCase();

  return /^[A-Z]$/.test(firstCharacter) ? firstCharacter : "#";
}

export function getAvailableMedicationAlphabetBuckets(
  medications: Medication[],
): MedicationAlphabetBucket[] {
  const buckets = new Set(
    medications.map((medication) => getMedicationAlphabetBucket(medication.name)),
  );

  return Array.from(buckets).sort((left, right) => {
    if (left === "#") return -1;
    if (right === "#") return 1;
    return left.localeCompare(right);
  });
}

/**
 * Uses the first prominent visible medication in FlatList order as the
 * current section. This advances to the next letter after the preceding
 * card's heading leaves the viewport. Sorting a copy keeps the viewability
 * callback source-safe.
 */
export function getMostRelevantVisibleMedicationAlphabetBucket(
  viewableItems: readonly MedicationAlphabetViewableItem[],
  availableBuckets: readonly MedicationAlphabetBucket[],
): MedicationAlphabetBucket | null {
  const visibleItems = viewableItems
    .filter((token) => token.isViewable)
    .slice()
    .sort((left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER));
  const relevantVisible = visibleItems[0];
  if (!relevantVisible) return null;
  const bucket = getMedicationAlphabetBucket(relevantVisible.item.name);
  return availableBuckets.includes(bucket) ? bucket : null;
}

export type MedicationAlphabetRailGeometry = Readonly<{
  top: number;
  height: number;
  visible: boolean;
}>;

/**
 * Calculates a fixed rail that is centered inside the card viewport. It does
 * not accept scroll position, so the rail never stretches or travels while
 * cards are scrolled underneath it.
 */
export function getMedicationAlphabetRailGeometry(
  viewportHeight: number,
  bottomInset: number,
  bucketCount: number,
  rowHeight: number,
  paddingVertical: number,
  cardViewportTop: number,
): MedicationAlphabetRailGeometry {
  const height = bucketCount * rowHeight + paddingVertical * 2;
  const availableHeight = viewportHeight - bottomInset - cardViewportTop;
  const top = cardViewportTop + Math.max(0, (availableHeight - height) / 2);

  return {
    top,
    height,
    visible: bucketCount > 0 && availableHeight >= height,
  };
}

/**
 * Keeps the active rail letter inside the current list scope. Search hides the
 * rail; a lifecycle/profile switch starts at the new group's first bucket.
 */
export function resolveMedicationAlphabetSelection(
  previousBucket: MedicationAlphabetBucket | null,
  availableBuckets: readonly MedicationAlphabetBucket[],
  scopeChanged: boolean,
  query: string,
): MedicationAlphabetBucket | null {
  if (normalizeMedicationSearchQuery(query) || availableBuckets.length === 0) return null;
  if (scopeChanged || !previousBucket || !availableBuckets.includes(previousBucket)) {
    return availableBuckets[0] ?? null;
  }
  return previousBucket;
}

/**
 * Provides a compact, deterministic panel for the currently loaded
 * lifecycle group. Prefix matches are grouped before substring matches.
 */
export function getMedicationSearchSuggestions(
  medications: Medication[],
  query: string,
  limit = MEDICATION_SEARCH_SUGGESTION_LIMIT,
): Medication[] {
  const normalizedQuery = normalizeMedicationSearchQuery(query);
  if (!normalizedQuery || limit <= 0) return [];

  const matching = filterMedicationsBySearch(medications, normalizedQuery);
  const prefixMatches = matching.filter((medication) =>
    normalizeMedicationSearchQuery(medication.name).startsWith(normalizedQuery),
  );
  const substringMatches = matching.filter((medication) =>
    !normalizeMedicationSearchQuery(medication.name).startsWith(normalizedQuery),
  );

  return [
    ...sortMedicationsAlphabetically(prefixMatches),
    ...sortMedicationsAlphabetically(substringMatches),
  ].slice(0, limit);
}

/** Suggestion visibility follows the query and current result set, not input focus. */
export function shouldShowMedicationSearchSuggestions(
  query: string,
  suggestions: Medication[],
  selectionComplete: boolean,
  medicationProfileId: string | null,
  selectedProfileId: string | null,
): boolean {
  return Boolean(
    medicationProfileId === selectedProfileId &&
    normalizeMedicationSearchQuery(query) &&
    suggestions.length > 0 &&
    !selectionComplete,
  );
}

/**
 * Keeps a suggestion meaningful when read without its surrounding visual
 * context. This is deliberately separate from the displayed text so the
 * screen can stay compact while TalkBack receives the full description.
 */
export function getMedicationSearchSuggestionAccessibilityLabel(
  medication: Pick<Medication, "name" | "dosage">,
): string {
  return `${medication.name}, ${medication.dosage}. Show medication.`;
}

export function getMedicationAlphabetBucketAccessibilityLabel(
  bucket: MedicationAlphabetBucket,
): string {
  return bucket === "#"
    ? "Jump to medications starting with numbers or symbols"
    : `Jump to medications starting with ${bucket}`;
}

/**
 * Represents a navigation result selected from search without keeping the
 * search filter active. The medication ID remains unambiguous when names are
 * duplicated, and the empty next query restores the lifecycle list.
 */
export function createMedicationSearchJumpRequest(
  medicationId: string,
): MedicationSearchJumpRequest {
  return { medicationId, nextSearchQuery: "" };
}

/**
 * Keyboard Search follows the same selection behavior as tapping a
 * suggestion, choosing the already-ranked first result when one exists.
 */
export function getMedicationSearchSubmitJumpRequest(
  medications: Medication[],
  query: string,
): MedicationSearchJumpRequest | null {
  const firstSuggestion = getMedicationSearchSuggestions(medications, query)[0];

  return firstSuggestion
    ? createMedicationSearchJumpRequest(firstSuggestion.id)
    : null;
}

/**
 * Resolves the target only against the exact list currently rendered by the
 * FlatList. Returning -1 lets callers clear a stale target safely.
 */
export function findMedicationSearchJumpTargetIndex(
  visibleMedications: Medication[],
  medicationId: string,
): number {
  return visibleMedications.findIndex(
    (medication) => medication.id === medicationId,
  );
}

/**
 * Keeps the scroll position and visual emphasis tied to the same medication
 * ID. The index is calculated only for the list that is about to render.
 */
export function resolveMedicationSearchJumpTarget(
  visibleMedications: Medication[],
  medicationId: string,
): MedicationSearchJumpTarget | null {
  const index = findMedicationSearchJumpTargetIndex(
    visibleMedications,
    medicationId,
  );

  return index < 0 ? null : { medicationId, index };
}

/**
 * The final list item needs different geometry from a middle item. FlatList
 * cannot always satisfy a requested viewPosition near the end of content, so
 * use its end position while retaining the same stable medication ID.
 */
export function getMedicationSearchJumpScrollPlan(
  visibleMedications: Medication[],
  medicationId: string,
): MedicationSearchJumpScrollPlan | null {
  const target = resolveMedicationSearchJumpTarget(visibleMedications, medicationId);
  if (!target) return null;

  return {
    ...target,
    strategy: target.index === visibleMedications.length - 1 ? "end" : "index",
  };
}

/**
 * A suggestion jump must wait until its discovery query has been cleared and
 * the FlatList is rendering the restored lifecycle group. Resolving a plan
 * before that point can incorrectly use the filtered list's geometry.
 */
export function getMedicationSearchJumpPlanAfterListRestore(
  visibleMedications: Medication[],
  medicationId: string,
  query: string,
): MedicationSearchJumpScrollPlan | null {
  if (normalizeMedicationSearchQuery(query)) return null;

  return getMedicationSearchJumpScrollPlan(visibleMedications, medicationId);
}

export function isMedicationSearchJumpHighlighted(
  medicationId: string,
  highlightedMedicationId: string | null,
): boolean {
  return medicationId === highlightedMedicationId;
}

export function shouldShowMedicationAlphabetRail(
  medications: Medication[],
  query: string,
): boolean {
  if (normalizeMedicationSearchQuery(query)) return false;
  if (medications.length < MEDICATION_ALPHA_INDEX_MIN_ITEMS) return false;

  const bucketCount = getAvailableMedicationAlphabetBuckets(medications).length;

  return bucketCount >= MEDICATION_ALPHA_INDEX_MIN_BUCKETS &&
    bucketCount <= MEDICATION_ALPHA_INDEX_MAX_BUCKETS;
}
