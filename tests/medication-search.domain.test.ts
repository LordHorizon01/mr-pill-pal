import assert from "node:assert/strict";
import test from "node:test";

import {
  createMedicationSearchJumpRequest,
  filterMedicationsByLifecycle,
  findMedicationSearchJumpTargetIndex,
  filterMedicationsBySearch,
  getAvailableMedicationAlphabetBuckets,
  getMostRelevantVisibleMedicationAlphabetBucket,
  getMedicationAlphabetRailGeometry,
  getMedicationAlphabetBucket,
  getMedicationAlphabetBucketAccessibilityLabel,
  getMedicationSearchSuggestionAccessibilityLabel,
  getMedicationSearchSuggestions,
  getMedicationSearchJumpPlanAfterListRestore,
  getMedicationSearchJumpScrollPlan,
  getMedicationSearchSubmitJumpRequest,
  isMedicationSearchJumpHighlighted,
  normalizeMedicationSearchQuery,
  sortMedicationsAlphabetically,
  shouldShowMedicationSearchSuggestions,
  shouldShowMedicationAlphabetRail,
  resolveMedicationSearchJumpTarget,
  resolveMedicationAlphabetSelection,
} from "../src/features/medications/medication-search.domain";
import { Medication } from "../src/features/medications/medication.types";

function medication(id: string, name: string): Medication {
  return {
    id,
    profileId: "profile-a",
    name,
    dosage: "500 mg",
    isActive: true,
    createdAt: "2026-09-24T09:00:00.000Z",
    updatedAt: "2026-09-24T09:00:00.000Z",
  };
}

const activeMedications = [
  medication("1", "Paracetamol"),
  medication("2", "Vitamin D3"),
  medication("3", "Metformin Hydrochloride Extended Release"),
  medication("4", "PARA Plus"),
];

test("medication search supports exact, partial, and case-insensitive name matches", () => {
  assert.deepEqual(filterMedicationsBySearch(activeMedications, "Paracetamol").map((item) => item.id), ["1"]);
  assert.deepEqual(filterMedicationsBySearch(activeMedications, "para").map((item) => item.id), ["1", "4"]);
  assert.deepEqual(filterMedicationsBySearch(activeMedications, "PARA").map((item) => item.id), ["1", "4"]);
});

test("medication search trims and collapses query whitespace", () => {
  assert.equal(normalizeMedicationSearchQuery("  Metformin   Hydrochloride  "), "metformin hydrochloride");
  assert.deepEqual(
    filterMedicationsBySearch(activeMedications, "  metformin   hydrochloride  ").map((item) => item.id),
    ["3"],
  );
});

test("blank or whitespace-only search returns a new full-list result without mutation", () => {
  const blankResult = filterMedicationsBySearch(activeMedications, "");
  const whitespaceResult = filterMedicationsBySearch(activeMedications, "   ");

  assert.deepEqual(blankResult, activeMedications);
  assert.deepEqual(whitespaceResult, activeMedications);
  assert.notStrictEqual(blankResult, activeMedications);
  assert.deepEqual(activeMedications.map((item) => item.id), ["1", "2", "3", "4"]);
});

test("clearing a discovery query restores the complete lifecycle list for a suggestion jump", () => {
  const filtered = sortMedicationsAlphabetically(filterMedicationsBySearch(activeMedications, "para"));
  const restored = sortMedicationsAlphabetically(filterMedicationsBySearch(activeMedications, ""));

  assert.deepEqual(filtered.map((item) => item.id), ["4", "1"]);
  assert.deepEqual(restored.map((item) => item.id), ["3", "4", "1", "2"]);
  assert.equal(restored.findIndex((item) => item.id === "1"), 2);
});

test("suggestion jump requests use the exact medication ID and clear the discovery query", () => {
  const request = createMedicationSearchJumpRequest("duplicate-two");

  assert.deepEqual(request, { medicationId: "duplicate-two", nextSearchQuery: "" });
});

test("keyboard Search uses the highest-ranked suggestion and leaves no-result searches unchanged", () => {
  const medications = [
    medication("substring", "My Para Test"),
    medication("prefix-two", "Para Two"),
    medication("prefix-one", "Para One"),
  ];

  assert.deepEqual(getMedicationSearchSubmitJumpRequest(medications, "para"), {
    medicationId: "prefix-one",
    nextSearchQuery: "",
  });
  assert.equal(getMedicationSearchSubmitJumpRequest(medications, "ibuprofen"), null);
});

test("jump targets resolve only against the restored lifecycle list and fail safely when stale", () => {
  const duplicateNames = [
    medication("duplicate-one", "Paracetamol"),
    medication("duplicate-two", "Paracetamol"),
  ];
  const restoredActiveList = sortMedicationsAlphabetically([
    medication("other", "Amoxicillin"),
    ...duplicateNames,
  ]);
  const pausedList = [medication("paused", "Paracetamol")];

  assert.equal(findMedicationSearchJumpTargetIndex(restoredActiveList, "duplicate-two"), 2);
  assert.equal(findMedicationSearchJumpTargetIndex(restoredActiveList, "deleted-target"), -1);
  assert.equal(findMedicationSearchJumpTargetIndex(pausedList, "duplicate-two"), -1);
});

test("a restored full list recalculates the target index instead of reusing filtered index zero", () => {
  const filteredSearchResults = [medication("paracetamol", "Paracetamol")];
  const restoredFullList = [
    medication("btn-ultra", "Btn ultra"),
    medication("paracetamol", "Paracetamol"),
  ];

  assert.equal(resolveMedicationSearchJumpTarget(filteredSearchResults, "paracetamol")?.index, 0);
  assert.deepEqual(resolveMedicationSearchJumpTarget(restoredFullList, "paracetamol"), {
    medicationId: "paracetamol",
    index: 1,
  });
  assert.equal(isMedicationSearchJumpHighlighted("btn-ultra", "paracetamol"), false);
  assert.equal(isMedicationSearchJumpHighlighted("paracetamol", "paracetamol"), true);
});

test("jump target resolution and emphasis are correct at first, middle, and last positions", () => {
  const list = [
    medication("first", "Amoxicillin"),
    medication("middle", "Btn ultra"),
    medication("last", "Paracetamol"),
  ];

  assert.equal(resolveMedicationSearchJumpTarget(list, "first")?.index, 0);
  assert.equal(resolveMedicationSearchJumpTarget(list, "middle")?.index, 1);
  assert.equal(resolveMedicationSearchJumpTarget(list, "last")?.index, 2);
  assert.equal(resolveMedicationSearchJumpTarget(list, "missing"), null);
  assert.equal(isMedicationSearchJumpHighlighted("first", "last"), false);
  assert.equal(isMedicationSearchJumpHighlighted("last", "last"), true);
});

test("search jump uses indexed scrolling for non-final items and end scrolling for the exact final item", () => {
  const source = [
    medication("first", "Amoxicillin"),
    medication("middle", "Btn ultra"),
    medication("second-last", "Paracetamol"),
    medication("last", "Vitamin D"),
  ];
  const sourceIds = source.map((item) => item.id);

  assert.deepEqual(getMedicationSearchJumpScrollPlan(source, "first"), { medicationId: "first", index: 0, strategy: "index" });
  assert.deepEqual(getMedicationSearchJumpScrollPlan(source, "middle"), { medicationId: "middle", index: 1, strategy: "index" });
  assert.deepEqual(getMedicationSearchJumpScrollPlan(source, "second-last"), { medicationId: "second-last", index: 2, strategy: "index" });
  assert.deepEqual(getMedicationSearchJumpScrollPlan(source, "last"), { medicationId: "last", index: 3, strategy: "end" });
  assert.deepEqual(getMedicationSearchJumpScrollPlan([source[0]], "first"), { medicationId: "first", index: 0, strategy: "end" });
  assert.equal(getMedicationSearchJumpScrollPlan(source, "missing"), null);
  assert.deepEqual(source.map((item) => item.id), sourceIds);
});

test("restored lifecycle data decides the final-item plan instead of an old filtered-list position", () => {
  const filtered = [medication("paracetamol", "Paracetamol")];
  const restored = [
    medication("btn-ultra", "Btn ultra"),
    medication("paracetamol", "Paracetamol"),
    medication("vitamin-d", "Vitamin D"),
  ];

  assert.equal(getMedicationSearchJumpScrollPlan(filtered, "paracetamol")?.strategy, "end");
  assert.deepEqual(getMedicationSearchJumpScrollPlan(restored, "paracetamol"), {
    medicationId: "paracetamol",
    index: 1,
    strategy: "index",
  });
  assert.equal(getMedicationSearchJumpScrollPlan(restored, "vitamin-d")?.strategy, "end");
});

test("search jump waits for the restored full list before choosing its first, middle, or final scroll plan", () => {
  const fullList = [
    medication("first", "Amoxicillin"),
    medication("middle", "Btn Ultra"),
    medication("last", "Vitamin D"),
  ];
  const originalIds = fullList.map((item) => item.id);

  assert.equal(getMedicationSearchJumpPlanAfterListRestore(fullList, "middle", "btn"), null);
  assert.deepEqual(getMedicationSearchJumpPlanAfterListRestore(fullList, "first", ""), {
    medicationId: "first",
    index: 0,
    strategy: "index",
  });
  assert.deepEqual(getMedicationSearchJumpPlanAfterListRestore(fullList, "middle", "   "), {
    medicationId: "middle",
    index: 1,
    strategy: "index",
  });
  assert.deepEqual(getMedicationSearchJumpPlanAfterListRestore(fullList, "last", ""), {
    medicationId: "last",
    index: 2,
    strategy: "end",
  });
  assert.equal(getMedicationSearchJumpPlanAfterListRestore(fullList, "missing", ""), null);
  assert.deepEqual(fullList.map((item) => item.id), originalIds);
});

test("suggestion taps and keyboard Search select the same ID when the top result is tapped", () => {
  const medications = [medication("para", "Paracetamol"), medication("other", "My Para Test")];
  const tapRequest = createMedicationSearchJumpRequest("para");
  const keyboardRequest = getMedicationSearchSubmitJumpRequest(medications, "para");

  assert.equal(tapRequest.medicationId, keyboardRequest?.medicationId);
});

test("unmatched searches are empty and do not alter lifecycle filtering owned by the store", () => {
  assert.deepEqual(filterMedicationsBySearch(activeMedications, "ibuprofen"), []);

  const archivedGroup = [medication("5", "Paracetamol archive")];
  assert.deepEqual(filterMedicationsBySearch(archivedGroup, "para").map((item) => item.id), ["5"]);
  assert.deepEqual(filterMedicationsBySearch(activeMedications, "para").map((item) => item.id), ["1", "4"]);
});

test("case-similar names remain separate deterministic results and reflect source updates", () => {
  const initiallyMatched = filterMedicationsBySearch(activeMedications, "para");
  assert.deepEqual(initiallyMatched.map((item) => item.name), ["Paracetamol", "PARA Plus"]);

  const updatedSource = activeMedications.map((item) =>
    item.id === "1" ? { ...item, name: "Acetaminophen" } : item,
  );
  assert.deepEqual(filterMedicationsBySearch(updatedSource, "para").map((item) => item.id), ["4"]);
});

test("suggestions rank prefixes before substrings, ignore case, and respect the maximum", () => {
  const suggestions = getMedicationSearchSuggestions([
    medication("1", "My Para Test"),
    medication("2", "Para Two"),
    medication("3", "Para One"),
    medication("4", "PARA Three"),
    medication("5", "Paraffin"),
    medication("6", "Para Four"),
    medication("7", "Para Five"),
  ], "PARA");

  assert.deepEqual(suggestions.map((item) => item.name), [
    "Para Five",
    "Para Four",
    "Para One",
    "PARA Three",
    "Para Two",
  ]);
  assert.deepEqual(getMedicationSearchSuggestions(activeMedications, "   "), []);
});

test("suggestions only use their supplied lifecycle list and never mutate it", () => {
  const pausedMedication = medication("paused", "Paracetamol Paused");
  const before = activeMedications.map((item) => item.id);

  assert.deepEqual(getMedicationSearchSuggestions([pausedMedication], "para").map((item) => item.id), ["paused"]);
  assert.deepEqual(activeMedications.map((item) => item.id), before);
});

test("lifecycle filtering prevents old-group suggestions from leaking during a filter change", () => {
  const source = [
    medication("active", "Paracetamol Active"),
    { ...medication("paused", "Paracetamol Paused"), isActive: false },
    { ...medication("archived", "Paracetamol Archived"), isActive: false, archivedAt: "2026-09-20T10:00:00.000Z" },
  ];
  const originalIds = source.map((item) => item.id);

  assert.deepEqual(filterMedicationsByLifecycle(source, "active").map((item) => item.id), ["active"]);
  assert.deepEqual(filterMedicationsByLifecycle(source, "paused").map((item) => item.id), ["paused"]);
  assert.deepEqual(filterMedicationsByLifecycle(source, "archived").map((item) => item.id), ["archived"]);
  assert.deepEqual(source.map((item) => item.id), originalIds);
});

test("suggestion visibility depends on a meaningful query and matches, not keyboard focus", () => {
  const matches = [medication("para", "Paracetamol")];

  assert.equal(shouldShowMedicationSearchSuggestions("para", matches, false, "profile-a", "profile-a"), true);
  assert.equal(shouldShowMedicationSearchSuggestions("para", matches, true, "profile-a", "profile-a"), false);
  assert.equal(shouldShowMedicationSearchSuggestions("   ", matches, false, "profile-a", "profile-a"), false);
  assert.equal(shouldShowMedicationSearchSuggestions("xyzabc", [], false, "profile-a", "profile-a"), false);
  assert.equal(shouldShowMedicationSearchSuggestions("para", matches, false, "profile-a", "profile-b"), false);
});

test("suggestions and alphabet buckets expose useful screen-reader descriptions", () => {
  assert.equal(
    getMedicationSearchSuggestionAccessibilityLabel(medication("para", "Paracetamol")),
    "Paracetamol, 500 mg. Show medication.",
  );
  assert.equal(
    getMedicationAlphabetBucketAccessibilityLabel("P"),
    "Jump to medications starting with P",
  );
  assert.equal(
    getMedicationAlphabetBucketAccessibilityLabel("#"),
    "Jump to medications starting with numbers or symbols",
  );
});

test("alphabetical sorting is case-insensitive, stable for equal names, and non-mutating", () => {
  const source = [
    medication("first", "beta"),
    medication("second", "Alpha"),
    medication("third", "ALPHA"),
  ];

  assert.deepEqual(sortMedicationsAlphabetically(source).map((item) => item.id), ["second", "third", "first"]);
  assert.deepEqual(source.map((item) => item.id), ["first", "second", "third"]);
});

test("alphabet buckets group letters and numbers or symbols correctly", () => {
  assert.equal(getMedicationAlphabetBucket("Paracetamol"), "P");
  assert.equal(getMedicationAlphabetBucket("amoxicillin"), "A");
  assert.equal(getMedicationAlphabetBucket("3M Cream"), "#");
  assert.equal(getMedicationAlphabetBucket("@Medicine"), "#");

  assert.deepEqual(
    getAvailableMedicationAlphabetBuckets([
      medication("1", "Paracetamol"),
      medication("2", "Para Two"),
      medication("3", "amoxicillin"),
      medication("4", "3M Cream"),
      medication("5", "@Medicine"),
    ]),
    ["#", "A", "P"],
  );
});

test("alphabet selection follows the first prominent visible medication section without mutating viewability data", () => {
  const visible = [
    { item: medication("later", "Vitamin D"), index: 14, isViewable: true },
    { item: medication("not-visible", "Alpha"), index: 1, isViewable: false },
    { item: medication("first-visible", "Paracetamol"), index: 9, isViewable: true },
  ];
  const before = visible.map(({ item, index, isViewable }) => [item.id, index, isViewable]);

  assert.equal(getMostRelevantVisibleMedicationAlphabetBucket(visible, ["A", "P", "V"]), "P");
  assert.deepEqual(visible.map(({ item, index, isViewable }) => [item.id, index, isViewable]), before);
  assert.equal(getMostRelevantVisibleMedicationAlphabetBucket([], ["A"]), null);
});

test("alphabet rail geometry stays fixed for the same buckets and hides instead of compressing", () => {
  const standard = getMedicationAlphabetRailGeometry(800, 112, 7, 48, 4, 96);
  const afterSelectedLetterChanges = getMedicationAlphabetRailGeometry(800, 112, 7, 48, 4, 96);

  assert.deepEqual(standard, { top: 220, height: 344, visible: true });
  assert.deepEqual(afterSelectedLetterChanges, standard);
  assert.deepEqual(getMedicationAlphabetRailGeometry(500, 112, 7, 48, 4, 96), {
    top: 96,
    height: 344,
    visible: false,
  });
  assert.deepEqual(getMedicationAlphabetRailGeometry(800, 112, 0, 48, 4, 96), {
    top: 388,
    height: 8,
    visible: false,
  });
});

test("alphabet selection resets safely across lifecycle groups, profiles, and active search", () => {
  assert.equal(resolveMedicationAlphabetSelection("Z", ["M", "P"], true, ""), "M");
  assert.equal(resolveMedicationAlphabetSelection("P", ["A", "P"], false, ""), "P");
  assert.equal(resolveMedicationAlphabetSelection("P", ["A", "M"], false, ""), "A");
  assert.equal(resolveMedicationAlphabetSelection("P", ["A", "P"], false, "para"), null);
  assert.equal(resolveMedicationAlphabetSelection("A", [], true, ""), null);
});

test("alphabet rail needs enough medications and distinct buckets and stays hidden during search", () => {
  const twelveOneBucket = Array.from({ length: 12 }, (_, index) => medication(`${index}`, `Para ${index}`));
  const largeEnough = Array.from({ length: 12 }, (_, index) => {
    const prefixes = ["Alpha", "Beta", "Charlie", "Medicine"];
    return medication(`${index}`, `${prefixes[index % prefixes.length]} ${index}`);
  });

  assert.equal(shouldShowMedicationAlphabetRail(twelveOneBucket.slice(0, 11), ""), false);
  assert.equal(shouldShowMedicationAlphabetRail(twelveOneBucket, ""), false);
  assert.equal(shouldShowMedicationAlphabetRail(largeEnough, ""), true);
  assert.equal(shouldShowMedicationAlphabetRail(largeEnough, "med"), false);
});

test("alphabet rail safely hides when too many distinct buckets would make compact targets unusable", () => {
  const prefixes = ["Alpha", "Beta", "Charlie", "Delta", "Echo", "Foxtrot", "Gamma", "Hotel", "India"];
  const medications = Array.from({ length: 18 }, (_, index) =>
    medication(`${index}`, `${prefixes[index % prefixes.length]} ${index}`),
  );

  assert.equal(shouldShowMedicationAlphabetRail(medications, ""), false);
});

test("search helpers remain deterministic and source-safe with 250 medications", () => {
  const prefixes = ["Alpha", "Beta", "Charlie", "Delta", "Para"];
  const source = Array.from({ length: 250 }, (_, index) =>
    medication(`large-${index}`, `${prefixes[index % prefixes.length]} ${String(index).padStart(3, "0")}`),
  );
  const sourceIds = source.map((item) => item.id);

  const suggestions = getMedicationSearchSuggestions(source, "para");
  const sorted = sortMedicationsAlphabetically(source);
  const buckets = getAvailableMedicationAlphabetBuckets(source);

  assert.deepEqual(suggestions.map((item) => item.id), [
    "large-4",
    "large-9",
    "large-14",
    "large-19",
    "large-24",
  ]);
  assert.equal(sorted.length, 250);
  assert.deepEqual(buckets, ["A", "B", "C", "D", "P"]);
  assert.equal(shouldShowMedicationAlphabetRail(source, ""), true);
  assert.deepEqual(source.map((item) => item.id), sourceIds);
});
