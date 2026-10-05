import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View, ViewToken } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/screen-header";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { useMedications } from "@/hooks/useMedications";
import { Medication } from "@/features/medications/medication.types";
import { hasMedicationChanges } from "@/features/medications/medication.domain";
import { AutoDismissNotice } from "@/components/auto-dismiss-notice";
import { StatusBadge, ThemedButton, ThemedChip } from "@/components/themed-ui";
import { useProfileStore } from "@/state/profile.store";
import { useMedicationStore } from "@/state/medication.store";
import { ContentFade, MedicationListSkeleton } from "@/components/loading-primitives";
import { TabContentTransition } from "@/components/tab-content-transition";
import { motion } from "@/components/motion-tokens";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { formatStockQuantity, getRefillStockState } from "@/features/refills/refill.domain";
import { MedicationOverflowSheet } from "@/features/medications/medication-overflow-sheet";
import { AnchoredMenuAnchor } from "@/components/anchored-action-menu.domain";
import {
  createMedicationSearchJumpRequest,
  filterMedicationsBySearch,
  getAvailableMedicationAlphabetBuckets,
  getMedicationAlphabetBucket,
  getMedicationAlphabetBucketAccessibilityLabel,
  getMostRelevantVisibleMedicationAlphabetBucket,
  getMedicationAlphabetRailGeometry,
  filterMedicationsByLifecycle,
  getMedicationSearchSubmitJumpRequest,
  getMedicationSearchSuggestionAccessibilityLabel,
  getMedicationSearchSuggestions,
  getMedicationSearchJumpPlanAfterListRestore,
  getMedicationSearchJumpScrollPlan,
  MEDICATION_SEARCH_JUMP_HIGHLIGHT_DURATION_MS,
  isMedicationSearchJumpHighlighted,
  normalizeMedicationSearchQuery,
  shouldShowMedicationSearchSuggestions,
  shouldShowMedicationAlphabetRail,
  resolveMedicationAlphabetSelection,
  sortMedicationsAlphabetically,
} from "@/features/medications/medication-search.domain";

type Filter = "active" | "paused" | "archived";
type Editing = Pick<Medication, "id" | "name" | "dosage">;

const ALPHABET_RAIL_CARD_VIEWPORT_TOP = 96;
const ALPHABET_RAIL_BOTTOM_INSET = 112;
const ALPHABET_RAIL_ROW_HEIGHT = ui.touch.minimum;
const ALPHABET_RAIL_VERTICAL_PADDING = 4;

export default function MedicationsScreen() {
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const styles = createStyles(colors);
  const store = useMedications();
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId);
  const medicationProfileId = useMedicationStore((state) => state.profileId);
  const loadedProfileId = useMedicationStore((state) => state.loadedProfileId);
  const loadedFilter = useMedicationStore((state) => state.loadedFilter);
  const medicationListRef = useRef<FlatList<Medication>>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJumpFrameRef = useRef<number | null>(null);
  const pendingJumpScopeRef = useRef<{ filter: Filter; profileId: string | null } | null>(null);
  const activeScrollRequestRef = useRef<{ filter: Filter; medicationId: string; profileId: string | null } | null>(null);
  const visibleMedicationsRef = useRef<Medication[]>([]);
  const [name, setName] = useState(""); const [dosage, setDosage] = useState("");
  const [filter, setFilter] = useState<Filter>("active"); const [editing, setEditing] = useState<Editing | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSuggestionSelectionComplete, setIsSuggestionSelectionComplete] = useState(false);
  const [pendingScrollMedicationId, setPendingScrollMedicationId] = useState<string | null>(null);
  const [highlightedMedicationId, setHighlightedMedicationId] = useState<string | null>(null);
  const [listHeaderHeight, setListHeaderHeight] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [sectionHeadingBottom, setSectionHeadingBottom] = useState(0);
  const [isAlphabetRailCardAreaVisible, setIsAlphabetRailCardAreaVisible] = useState(false);
  const [searchDropdownTop, setSearchDropdownTop] = useState<number | null>(null);
  const [activeAlphabetBucket, setActiveAlphabetBucket] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const [overflowMedication, setOverflowMedication] = useState<Medication | null>(null);
  const [overflowAnchor, setOverflowAnchor] = useState<AnchoredMenuAnchor | null>(null);
  const hasCurrentMedicationData = medicationProfileId === selectedProfileId && loadedProfileId === selectedProfileId && loadedFilter === filter;
  const delayedLoadingVisible = useDelayedLoading(store.isLoading && !hasCurrentMedicationData);
  const showFirstScopeSkeleton = !store.error && !hasCurrentMedicationData && delayedLoadingVisible;
  const hasCurrentMedicationContent = hasCurrentMedicationData;
  const scopedMedications = hasCurrentMedicationContent ? store.medications : [];
  const currentSearchQueryRef = useRef(searchQuery);
  const currentTargetIdRef = useRef(pendingScrollMedicationId);
  currentSearchQueryRef.current = searchQuery;
  currentTargetIdRef.current = pendingScrollMedicationId;
  useFocusEffect(useCallback(() => { void store.loadMedications(filter); return () => setNotice(null); }, [filter, selectedProfileId, store.loadMedications]));
  const clearJumpHighlight = useCallback(() => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = null;
    setHighlightedMedicationId(null);
  }, []);
  const showJumpHighlight = useCallback((medicationId: string) => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedMedicationId(medicationId);
    highlightTimeoutRef.current = setTimeout(() => {
      highlightTimeoutRef.current = null;
      setHighlightedMedicationId(null);
    }, MEDICATION_SEARCH_JUMP_HIGHLIGHT_DURATION_MS);
  }, []);
  const cancelPendingMedicationJump = useCallback(() => {
    if (pendingJumpFrameRef.current !== null) cancelAnimationFrame(pendingJumpFrameRef.current);
    pendingJumpFrameRef.current = null;
    pendingJumpScopeRef.current = null;
    setPendingScrollMedicationId(null);
  }, []);
  const clearActiveScrollRequest = useCallback(() => { activeScrollRequestRef.current = null; }, []);
  useEffect(() => () => { if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); }, []);
  useEffect(() => { setSearchQuery(""); setIsSuggestionSelectionComplete(false); cancelPendingMedicationJump(); clearActiveScrollRequest(); clearJumpHighlight(); }, [cancelPendingMedicationJump, clearActiveScrollRequest, clearJumpHighlight, selectedProfileId]);
  useEffect(() => { setIsAlphabetRailCardAreaVisible(false); cancelPendingMedicationJump(); clearActiveScrollRequest(); clearJumpHighlight(); }, [cancelPendingMedicationJump, clearActiveScrollRequest, clearJumpHighlight, filter, selectedProfileId]);
  const changed = useMemo(() => Boolean(editing && hasMedicationChanges(editing as Medication, { name, dosage })), [name, dosage, editing]);
  const normalizedSearchQuery = useMemo(() => normalizeMedicationSearchQuery(searchQuery), [searchQuery]);
  const lifecycleMedications = useMemo(() => filterMedicationsByLifecycle(scopedMedications, filter), [scopedMedications, filter]);
  const visibleMedications = useMemo(() => sortMedicationsAlphabetically(filterMedicationsBySearch(lifecycleMedications, searchQuery)), [lifecycleMedications, searchQuery]);
  visibleMedicationsRef.current = visibleMedications;
  const suggestions = useMemo(() => getMedicationSearchSuggestions(lifecycleMedications, searchQuery), [lifecycleMedications, searchQuery]);
  const availableAlphabetBuckets = useMemo(() => getAvailableMedicationAlphabetBuckets(lifecycleMedications), [lifecycleMedications]);
  const alphabetRailEligible = useMemo(() => shouldShowMedicationAlphabetRail(lifecycleMedications, searchQuery), [lifecycleMedications, searchQuery]);
  const showSuggestions = shouldShowMedicationSearchSuggestions(searchQuery, suggestions, isSuggestionSelectionComplete, medicationProfileId, selectedProfileId);
  const supportsCompactAlphabetRail = fontScale <= 1.4;
  const hasCurrentProfileMedications = medicationProfileId === selectedProfileId;
  const alphabetRailGeometry = getMedicationAlphabetRailGeometry(
    listViewportHeight,
    ALPHABET_RAIL_BOTTOM_INSET,
    availableAlphabetBuckets.length,
    ALPHABET_RAIL_ROW_HEIGHT,
    ALPHABET_RAIL_VERTICAL_PADDING,
    ALPHABET_RAIL_CARD_VIEWPORT_TOP,
  );
  const showAlphabetRail = hasCurrentProfileMedications && alphabetRailEligible && supportsCompactAlphabetRail && isAlphabetRailCardAreaVisible && alphabetRailGeometry.visible;
  const reserveCardRailSpace = showAlphabetRail;
  const alphabetScopeRef = useRef({ filter, profileId: selectedProfileId });
  const alphabetBucketsRef = useRef(availableAlphabetBuckets);
  const alphabetRailEligibleRef = useRef(alphabetRailEligible);
  alphabetBucketsRef.current = availableAlphabetBuckets;
  alphabetRailEligibleRef.current = hasCurrentProfileMedications && alphabetRailEligible && supportsCompactAlphabetRail;
  const alphabetViewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onAlphabetViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!alphabetRailEligibleRef.current) return;
    const bucket = getMostRelevantVisibleMedicationAlphabetBucket(
      viewableItems as { item: Pick<Medication, "name">; index: number | null; isViewable: boolean }[],
      alphabetBucketsRef.current,
    );
    if (bucket) setActiveAlphabetBucket(bucket);
  }).current;
  useEffect(() => {
    const scopeChanged = alphabetScopeRef.current.filter !== filter || alphabetScopeRef.current.profileId !== selectedProfileId;
    alphabetScopeRef.current = { filter, profileId: selectedProfileId };
    setActiveAlphabetBucket((current) => resolveMedicationAlphabetSelection(current, availableAlphabetBuckets, scopeChanged, searchQuery));
  }, [availableAlphabetBuckets, filter, searchQuery, selectedProfileId]);
  const performMedicationSearchJump = useCallback((medicationId: string, strategy: "index" | "end", index: number) => {
    if (strategy === "end") {
      medicationListRef.current?.scrollToEnd({ animated: true });
    } else {
      medicationListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    }
    showJumpHighlight(medicationId);
  }, [showJumpHighlight]);
  useEffect(() => {
    const pendingScope = pendingJumpScopeRef.current;
    if (!pendingScrollMedicationId || normalizedSearchQuery) return;
    if (medicationProfileId !== selectedProfileId) {
      cancelPendingMedicationJump();
      return;
    }
    if (!pendingScope || pendingScope.filter !== filter || pendingScope.profileId !== selectedProfileId) {
      cancelPendingMedicationJump();
      return;
    }
    const plan = getMedicationSearchJumpPlanAfterListRestore(visibleMedications, pendingScrollMedicationId, searchQuery);
    if (!plan) {
      cancelPendingMedicationJump();
      return;
    }

    const frame = requestAnimationFrame(() => {
      pendingJumpFrameRef.current = null;
      const currentScope = pendingJumpScopeRef.current;
      if (medicationProfileId !== selectedProfileId || !currentScope || currentScope.filter !== filter || currentScope.profileId !== selectedProfileId) return;
      if (pendingScrollMedicationId !== currentTargetIdRef.current) return;

      const currentPlan = getMedicationSearchJumpPlanAfterListRestore(
        visibleMedicationsRef.current,
        pendingScrollMedicationId,
        currentSearchQueryRef.current,
      );
      if (!currentPlan) {
        cancelPendingMedicationJump();
        return;
      }

      activeScrollRequestRef.current = currentPlan.strategy === "index"
        ? { filter, medicationId: currentPlan.medicationId, profileId: selectedProfileId }
        : null;
      performMedicationSearchJump(currentPlan.medicationId, currentPlan.strategy, currentPlan.index);
      pendingJumpScopeRef.current = null;
      setPendingScrollMedicationId(null);
    });
    pendingJumpFrameRef.current = frame;
    return () => {
      cancelAnimationFrame(frame);
      if (pendingJumpFrameRef.current === frame) pendingJumpFrameRef.current = null;
    };
  }, [cancelPendingMedicationJump, filter, medicationProfileId, normalizedSearchQuery, pendingScrollMedicationId, searchQuery, selectedProfileId, visibleMedications]);
  const cancelEdit = () => { setEditing(null); setName(""); setDosage(""); };
  const beginEdit = (m: Medication) => { setEditing({ id: m.id, name: m.name, dosage: m.dosage }); setName(m.name); setDosage(m.dosage); setNotice(null); };
  async function save() { setIsSaving(true); try { if (editing) { await store.updateMedication(editing.id, { name, dosage }); setNotice("Medication updated."); } else { await store.createMedication({ name, dosage }); setNotice("Medication added."); } cancelEdit(); } catch {} finally { setIsSaving(false); } }
  function requestSave() { if (editing && !changed) return; if (!editing) { void save(); return; } Alert.alert("Save medication changes?", `You are updating:\n\n${editing.name}`, [{ text: "Cancel", style: "cancel" }, { text: "Update", onPress: () => void save() }]); }
  function requestArchive(m: Medication) { Alert.alert("Archive medication?", `${m.name} will move to Archived. Existing dose history will be kept.`, [{ text: "Cancel", style: "cancel" }, { text: "Archive", onPress: () => void store.archiveMedication(m.id).then(() => setNotice("Medication archived.")).catch(() => undefined) }]); }
  function requestDelete(m: Medication) { Alert.alert("Delete medication?", `“${m.name}” will be removed from your medication list. Future schedules and reminders for this medication will be cancelled. Existing finalized intake history will be preserved.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void store.deleteMedication(m.id).then(() => setNotice("Medication deleted.")).catch(() => undefined) }]); }
  function more(m: Medication, anchor: View | null) { anchor?.measureInWindow((x, y, width, height) => { setOverflowAnchor({ x, y, width, height }); setOverflowMedication(m); }); }
  const closeOverflow = () => { setOverflowMedication(null); setOverflowAnchor(null); };
  const updateSearchQuery = (value: string) => { cancelPendingMedicationJump(); clearActiveScrollRequest(); clearJumpHighlight(); setSearchQuery(value); setIsSuggestionSelectionComplete(false); };
  const clearSearch = () => { cancelPendingMedicationJump(); clearActiveScrollRequest(); clearJumpHighlight(); setSearchQuery(""); setIsSuggestionSelectionComplete(false); };
  const jumpToMedication = (medicationId: string) => { cancelPendingMedicationJump(); clearActiveScrollRequest(); clearJumpHighlight(); const request = createMedicationSearchJumpRequest(medicationId); pendingJumpScopeRef.current = { filter, profileId: selectedProfileId }; setPendingScrollMedicationId(request.medicationId); setSearchQuery(request.nextSearchQuery); setIsSuggestionSelectionComplete(true); Keyboard.dismiss(); };
  const submitMedicationSearch = () => { const request = medicationProfileId === selectedProfileId ? getMedicationSearchSubmitJumpRequest(lifecycleMedications, searchQuery) : null; if (request) jumpToMedication(request.medicationId); else Keyboard.dismiss(); };
  const jumpToAlphabetBucket = (bucket: string) => { const index = visibleMedications.findIndex((medication) => getMedicationAlphabetBucket(medication.name) === bucket); if (index >= 0) { setActiveAlphabetBucket(bucket); clearActiveScrollRequest(); medicationListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.08 }); } };
  const empty = filter === "active" ? "No active medications." : filter === "paused" ? "No paused medications." : "No archived medications.";
  const hasSearchResults = visibleMedications.length > 0;
  return <TabContentTransition style={styles.container}><ScreenHeader title="Medications" /><View style={styles.container} onLayout={(event) => setListViewportHeight(event.nativeEvent.layout.height)}><MedicationOverflowSheet medication={overflowMedication} anchor={overflowAnchor} onClose={closeOverflow} onArchive={() => { const medication = overflowMedication; closeOverflow(); if (medication) requestArchive(medication); }} onDelete={() => { const medication = overflowMedication; closeOverflow(); if (medication) requestDelete(medication); }} /><FlatList ref={medicationListRef} data={visibleMedications} keyExtractor={(x) => x.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} viewabilityConfig={alphabetViewabilityConfig} onViewableItemsChanged={onAlphabetViewableItemsChanged} onScrollBeginDrag={clearActiveScrollRequest} onScroll={(event) => { const offset = event.nativeEvent.contentOffset.y; const cardAreaStart = Math.max(0, sectionHeadingBottom - ALPHABET_RAIL_CARD_VIEWPORT_TOP); const next = sectionHeadingBottom > 0 && offset >= cardAreaStart; setIsAlphabetRailCardAreaVisible((current) => current === next ? current : next); }} onMomentumScrollEnd={clearActiveScrollRequest} onScrollToIndexFailed={(info) => { const request = activeScrollRequestRef.current; if (!request || request.filter !== filter || request.profileId !== selectedProfileId) return; const plan = getMedicationSearchJumpScrollPlan(visibleMedicationsRef.current, request.medicationId); if (!plan) { clearActiveScrollRequest(); return; } if (plan.strategy === "end") { medicationListRef.current?.scrollToEnd({ animated: true }); } else { medicationListRef.current?.scrollToOffset({ offset: Math.max(0, listHeaderHeight + info.averageItemLength * Math.max(0, plan.index - 1)), animated: true }); } showJumpHighlight(plan.medicationId); }} renderItem={({ item }) => <View style={reserveCardRailSpace ? styles.cardAreaWithAlphabetRail : undefined}><Card medication={item} highlighted={isMedicationSearchJumpHighlighted(item.id, highlightedMedicationId)} onEdit={beginEdit} onMore={more} onRestore={(id) => void store.restoreMedication(id).then(() => setNotice("Medication restored.")).catch(() => undefined)} /></View>} ListHeaderComponent={<View style={styles.listHeaderOverlayHost} onLayout={(event) => setListHeaderHeight(event.nativeEvent.layout.height)}>
    <View style={styles.listHeaderContent}>
      <Text style={styles.intro}>Add and manage your medications</Text>
      <View style={styles.searchAnchor} onLayout={(event) => setSearchDropdownTop(event.nativeEvent.layout.y + event.nativeEvent.layout.height + 6)}>
        <View style={styles.searchContainer}><TextInput accessibilityLabel="Search medications" accessibilityHint="Type a medication name to filter. Use Search to jump to the first suggestion." placeholder="Search medications" placeholderTextColor={colors.muted} value={searchQuery} onChangeText={updateSearchQuery} onFocus={() => setIsSuggestionSelectionComplete(false)} style={styles.searchInput} returnKeyType="search" blurOnSubmit onSubmitEditing={submitMedicationSearch} autoCorrect={false} autoCapitalize="none" />{normalizedSearchQuery ? <Pressable onPress={clearSearch} style={styles.clearSearchButton} accessibilityRole="button" accessibilityLabel="Clear medication search"><Text style={styles.clearSearchText}>Clear</Text></Pressable> : null}</View>
      </View>
      {showSuggestions && searchDropdownTop !== null ? <View style={[styles.suggestions, { top: searchDropdownTop }]} accessible={false}>{suggestions.map((medication) => <Pressable key={medication.id} style={styles.suggestionRow} onPress={() => jumpToMedication(medication.id)} accessibilityRole="button" accessibilityLabel={getMedicationSearchSuggestionAccessibilityLabel(medication)} accessibilityHint="Clears the search and scrolls to this medication card."><Text numberOfLines={1} style={styles.suggestionName}>{medication.name}</Text><Text numberOfLines={1} style={styles.suggestionDosage}>{medication.dosage}</Text></Pressable>)}</View> : null}
      <View style={styles.filters}>{(["active", "paused", "archived"] as const).map((v) => <ThemedChip key={v} label={v[0].toUpperCase() + v.slice(1)} selected={filter === v} onPress={() => setFilter(v)} accessibilityLabel={`${v} medications${filter === v ? ", selected" : ""}`} />)}</View>
      {store.error ? <Pressable onPress={store.clearError} style={styles.error} accessibilityRole="button" accessibilityLabel={`${store.error}. Tap to dismiss.`}><Text accessibilityRole="alert" style={styles.messageText}>{store.error}</Text><Text>Tap to dismiss</Text></Pressable> : null}<AutoDismissNotice message={notice} onDismiss={() => setNotice(null)} />
      <View style={styles.form}><Text style={styles.formTitle}>{editing ? "Edit Medication" : "Add medication"}</Text>{editing ? <Text style={styles.editing}>Editing: {editing.name}</Text> : null}<TextInput accessibilityLabel="Medication name" placeholder="Medication name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} /><TextInput accessibilityLabel="Dosage" placeholder="Dosage, for example 500 mg" placeholderTextColor={colors.muted} value={dosage} onChangeText={setDosage} style={styles.input} />{editing && !changed ? <Text style={styles.noChanges}>No changes to save.</Text> : null}<View style={styles.formActions}>{editing ? <Button label="Cancel" onPress={cancelEdit} disabled={isSaving} secondary accessibilityLabel="Cancel editing" /> : null}<Button label={isSaving ? "Saving..." : editing ? "Update Medication" : "Add Medication"} onPress={requestSave} disabled={isSaving || Boolean(editing && !changed)} accessibilityLabel={editing ? "Update medication" : "Add medication"} /></View></View>
      <Text style={styles.heading} onLayout={(event) => setSectionHeadingBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}>{filter[0].toUpperCase() + filter.slice(1)} medications</Text>
    </View>
  </View>} ListEmptyComponent={showFirstScopeSkeleton ? <ContentFade key="medication-skeleton" duration={motion.duration.skeletonCrossfade}><MedicationListSkeleton /></ContentFade> : hasCurrentMedicationContent ? <ContentFade key="medication-empty" duration={motion.duration.skeletonCrossfade}><View style={styles.empty}><Text style={styles.emptyTitle}>{normalizedSearchQuery ? `No medications match “${searchQuery.trim()}”.` : empty}</Text><Text style={styles.emptyText}>{normalizedSearchQuery ? "Try another name or clear the search." : filter === "active" ? "Add your first medication above." : "Choose another medication group to review it."}</Text>{normalizedSearchQuery && !hasSearchResults ? <Pressable style={styles.clearEmptySearchButton} onPress={clearSearch} accessibilityRole="button" accessibilityLabel="Clear medication search"><Text style={styles.clearEmptySearchText}>Clear search</Text></Pressable> : null}</View></ContentFade> : null} />{showAlphabetRail ? <AlphabetRail buckets={availableAlphabetBuckets} activeBucket={activeAlphabetBucket} geometry={{ top: alphabetRailGeometry.top, height: alphabetRailGeometry.height }} onJump={jumpToAlphabetBucket} /> : null}</View></TabContentTransition>;
}

function Button({ label, onPress, disabled, secondary, compact = false, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; compact?: boolean; accessibilityLabel: string }) { return <ThemedButton label={label} onPress={onPress} disabled={disabled} tone={secondary ? "outline" : "primary"} size={compact ? "compact" : "regular"} accessibilityLabel={accessibilityLabel} style={secondary ? undefined : { flexGrow: 1 }} />; }
function AlphabetRail({ buckets, activeBucket, geometry, onJump }: { buckets: string[]; activeBucket: string | null; geometry: { top: number; height: number }; onJump: (bucket: string) => void }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View style={[styles.alphabetRail, geometry]} accessible={false}><View pointerEvents="none" style={styles.alphabetRailDivider} />{buckets.map((bucket) => { const selected = activeBucket === bucket; return <Pressable key={bucket} style={({ pressed }) => [styles.alphabetRailButton, pressed && styles.alphabetRailButtonPressed]} onPress={() => onJump(bucket)} accessibilityRole="button" accessibilityLabel={getMedicationAlphabetBucketAccessibilityLabel(bucket)} accessibilityState={{ selected }} hitSlop={{ left: 6, right: 6 }}><View style={[styles.alphabetRailPill, selected && styles.alphabetRailPillSelected]}><Text style={[styles.alphabetRailText, selected && styles.alphabetRailTextSelected]}>{bucket}</Text></View></Pressable>; })}</View>; }
function Card({ medication, highlighted, onEdit, onMore, onRestore }: { medication: Medication; highlighted: boolean; onEdit: (m: Medication) => void; onMore: (m: Medication, anchor: View | null) => void; onRestore: (id: string) => void }) { const { colors } = useAppTheme(); const styles = createStyles(colors); const overflowAnchorRef = useRef<View>(null); const status = medication.archivedAt ? "Archived" : medication.isActive ? "Active" : "Paused"; const tone = medication.archivedAt ? "expired" : medication.isActive ? "active" : "paused"; const inventory = medication.refillInventory; const stockState = inventory ? getRefillStockState(inventory) : "disabled"; return <View style={[styles.card, highlighted && styles.highlightedCard]}><View style={styles.cardTopRow}><View style={styles.cardTitle}><Text style={styles.name}>{medication.name}</Text><Text style={styles.dosage}>{medication.dosage}</Text></View><View ref={overflowAnchorRef} collapsable={false}><Pressable style={styles.overflowButton} onPress={() => onMore(medication, overflowAnchorRef.current)} accessibilityRole="button" accessibilityLabel={`More actions for ${medication.name}`} hitSlop={8}><Text style={styles.overflowIcon}>⋮</Text></Pressable></View></View><StatusBadge label={status} tone={tone} style={styles.status} />{inventory?.trackingEnabled ? <Text style={[styles.stock, stockState === "low" && { color: colors.warning }]}>{stockState === "low" ? "Refill soon: " : "Stock: "}{formatStockQuantity(inventory.currentQuantity, inventory.unit)}</Text> : null}<View style={styles.actions}>{medication.archivedAt ? <Button label="Restore" onPress={() => onRestore(medication.id)} accessibilityLabel={`Restore ${medication.name}`} secondary compact /> : <><Button label="Schedule" onPress={() => router.push({ pathname: "/schedule", params: { medicationId: medication.id, medicationName: medication.name, profileId: medication.profileId } })} accessibilityLabel={`Manage schedule for ${medication.name}`} secondary compact /><Button label="Edit" onPress={() => onEdit(medication)} accessibilityLabel={`Edit ${medication.name}`} secondary compact /><Button label="Refill" onPress={() => router.push({ pathname: "/refill-settings" as never, params: { medicationId: medication.id, profileId: medication.profileId } })} accessibilityLabel={`Manage refill tracking for ${medication.name}`} secondary compact /></>}</View></View>; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: { flex: 1 },
  list: { padding: ui.spacing.screen, paddingTop: 20, paddingBottom: 96 },
  cardAreaWithAlphabetRail: { marginRight: 26 },
  listHeaderOverlayHost: { position: "relative", zIndex: 2, elevation: 2, overflow: "visible" },
  listHeaderContent: { position: "relative" },
  intro: { marginTop: 18, fontSize: 16, lineHeight: 22, color: colors.textSecondary },
  searchAnchor: { position: "relative", marginTop: 16, zIndex: 3, elevation: 3 },
  searchContainer: { minHeight: 52, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, backgroundColor: colors.inputBackground },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, paddingHorizontal: 14, fontSize: 16, color: colors.inputForeground },
  clearSearchButton: { minWidth: 52, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, marginRight: 4, borderRadius: ui.radius.button },
  clearSearchText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  suggestions: { position: "absolute", left: 0, right: 0, maxHeight: 260, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.button, backgroundColor: colors.cardBackground, overflow: "hidden", zIndex: 4, elevation: 4 },
  suggestionRow: { minHeight: 48, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionName: { fontSize: 16, fontWeight: "700", color: colors.cardForeground },
  suggestionDosage: { marginTop: 2, fontSize: 14, color: colors.textSecondary },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  form: { gap: 12, marginTop: ui.spacing.section, padding: ui.spacing.card, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  formTitle: { fontSize: 18, fontWeight: "700", color: colors.cardForeground },
  editing: { fontSize: 15, fontWeight: "600", color: colors.primary },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, paddingHorizontal: 14, fontSize: 16, color: colors.inputForeground, backgroundColor: colors.inputBackground },
  formActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  noChanges: { color: colors.textMuted, fontSize: 14 },
  heading: { marginTop: ui.spacing.section, marginBottom: 12, fontSize: 19, fontWeight: "700", color: colors.textPrimary },
  card: { padding: ui.spacing.card, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, borderRadius: ui.radius.card, backgroundColor: colors.cardBackground },
  highlightedCard: { borderColor: colors.primary, borderTopColor: colors.primary, backgroundColor: colors.secondaryBackground },
  cardTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardTitle: { flex: 1, minWidth: 0 },
  overflowButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -10, marginRight: -10, borderRadius: 22 },
  overflowIcon: { fontSize: 25, lineHeight: 28, fontWeight: "700", color: colors.textSecondary },
  name: { fontSize: 19, fontWeight: "700", color: colors.cardForeground, flexShrink: 1 },
  dosage: { marginTop: 4, fontSize: 16, color: colors.textSecondary },
  status: { marginTop: 12 },
  stock: { marginTop: 10, fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: ui.spacing.xs, marginTop: ui.spacing.md },
  alphabetRail: { position: "absolute", right: 4, width: 28, paddingVertical: ALPHABET_RAIL_VERTICAL_PADDING, justifyContent: "flex-start", alignItems: "flex-end" },
  alphabetRailDivider: { position: "absolute", left: 0, top: 0, bottom: 0, width: 1, backgroundColor: colors.divider },
  alphabetRailButton: { width: 24, height: ALPHABET_RAIL_ROW_HEIGHT, alignItems: "center", justifyContent: "center", borderRadius: ui.radius.button },
  alphabetRailPill: { width: 20, height: 24, alignItems: "center", justifyContent: "center", borderRadius: ui.radius.chip },
  alphabetRailPillSelected: { backgroundColor: colors.secondaryBackground },
  alphabetRailButtonPressed: { backgroundColor: colors.secondaryBackground, opacity: 0.72 },
  alphabetRailText: { fontSize: 11, fontWeight: "500", color: colors.textMuted },
  alphabetRailTextSelected: { fontWeight: "700", color: colors.secondaryForeground },
  empty: { paddingVertical: 36, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  emptyText: { marginTop: 7, textAlign: "center", color: colors.textSecondary },
  clearEmptySearchButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginTop: 10, borderRadius: ui.radius.button },
  clearEmptySearchText: { fontSize: 15, fontWeight: "700", color: colors.primary },
  loader: { marginVertical: 26 },
  error: { marginTop: 16, padding: 14, borderRadius: ui.radius.button, backgroundColor: colors.dangerBackground },
  success: { marginTop: 16, padding: 14, borderRadius: ui.radius.button, backgroundColor: colors.successSurface },
  messageText: { fontWeight: "700", color: colors.textPrimary },
});
