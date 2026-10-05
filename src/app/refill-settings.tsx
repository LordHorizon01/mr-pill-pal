import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useAppTheme } from "@/components/app-theme-provider";
import { ThemedButton, ThemedChip } from "@/components/themed-ui";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { getSafeDatabaseErrorMessage } from "@/database/database";
import { getMedication } from "@/features/medications/medication.service";
import { calculateRefillAddition, formatStockQuantity, getRefillStockState, validateRefillAddition } from "@/features/refills/refill.domain";
import { getRefillTracking, recordRefill, saveRefillTracking } from "@/features/refills/refill.service";
import { MedicationInventory, STOCK_UNITS, StockUnit } from "@/features/refills/refill.types";
import { useProfileStore } from "@/state/profile.store";

const defaults = { currentQuantity: "0", unit: "tablets" as StockUnit, consumptionPerTaken: "1", lowStockThreshold: "0" };
const createOperationId = () => `refill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function RefillSettingsScreen() {
  const { medicationId, profileId: sourceProfileId } = useLocalSearchParams<{ medicationId?: string; profileId?: string }>();
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [medicationName, setMedicationName] = useState("");
  const [inventory, setInventory] = useState<MedicationInventory | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [currentQuantity, setCurrentQuantity] = useState(defaults.currentQuantity);
  const [unit, setUnit] = useState<StockUnit>(defaults.unit);
  const [consumptionPerTaken, setConsumptionPerTaken] = useState(defaults.consumptionPerTaken);
  const [lowStockThreshold, setLowStockThreshold] = useState(defaults.lowStockThreshold);
  const [quantityAdded, setQuantityAdded] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecordingRefill, setIsRecordingRefill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordRefillGuard = useRef(false);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++loadRequestRef.current;
    setLoadedProfileId(null);
    if (!profileId || !medicationId || (sourceProfileId && sourceProfileId !== profileId)) { setError("This refill screen belongs to a different profile. Return to Medications and choose a medicine for the current profile."); setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const [medication, savedInventory] = await Promise.all([getMedication(profileId, medicationId), getRefillTracking(profileId, medicationId)]);
      if (request !== loadRequestRef.current) return;
      if (!medication) throw new Error("Medication not found.");
      setMedicationName(medication.name);
      setInventory(savedInventory);
      setLoadedProfileId(profileId);
      if (savedInventory) {
        setTrackingEnabled(savedInventory.trackingEnabled); setCurrentQuantity(String(savedInventory.currentQuantity)); setUnit(savedInventory.unit);
        setConsumptionPerTaken(String(savedInventory.consumptionPerTaken)); setLowStockThreshold(String(savedInventory.lowStockThreshold));
      }
    } catch (loadError) { if (request === loadRequestRef.current) setError(getSafeDatabaseErrorMessage(loadError, "Could not load refill tracking. Please try again.")); }
    finally { if (request === loadRequestRef.current) setIsLoading(false); }
  }, [medicationId, profileId, sourceProfileId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!profileId || !medicationId || (sourceProfileId && sourceProfileId !== profileId)) return;
    setIsSaving(true); setError(null);
    try {
      await saveRefillTracking(profileId, medicationId, {
        trackingEnabled,
        currentQuantity: inventory ? inventory.currentQuantity : parseQuantity(currentQuantity, "Starting quantity"),
        unit,
        consumptionPerTaken: parseQuantity(consumptionPerTaken, "Used per Taken dose"),
        lowStockThreshold: parseQuantity(lowStockThreshold, "Low-stock warning"),
      });
      router.back();
    } catch (saveError) { setError(getSafeDatabaseErrorMessage(saveError, "Could not save refill tracking. Please try again.")); }
    finally { setIsSaving(false); }
  }

  function requestRecordRefill() {
    if (!profileId || !medicationId || (sourceProfileId && sourceProfileId !== profileId) || !inventory || !inventory.trackingEnabled || recordRefillGuard.current) return;
    recordRefillGuard.current = true;
    try {
      const added = validateRefillAddition(parseQuantity(quantityAdded, "Quantity added"));
      const calculation = calculateRefillAddition(inventory.currentQuantity, added);
      let confirmed = false;
      Alert.alert("Record refill?", `Add ${formatStockQuantity(calculation.quantityAdded, inventory.unit)} to ${medicationName || "this medication"}?\n\nCurrent stock: ${formatStockQuantity(calculation.quantityBefore, inventory.unit)}\nNew stock: ${formatStockQuantity(calculation.quantityAfter, inventory.unit)}`, [
        { text: "Cancel", style: "cancel", onPress: () => { recordRefillGuard.current = false; } },
        { text: "Record refill", onPress: () => { confirmed = true; void submitRefill(added); } },
      ], { cancelable: true, onDismiss: () => { if (!confirmed) recordRefillGuard.current = false; } });
    } catch (validationError) { recordRefillGuard.current = false; setError(getSafeDatabaseErrorMessage(validationError, "Enter a valid refill quantity.")); }
  }

  async function submitRefill(added: number) {
    if (!profileId || !medicationId || (sourceProfileId && sourceProfileId !== profileId)) { recordRefillGuard.current = false; return; }
    setIsRecordingRefill(true); setError(null);
    try {
      const result = await recordRefill(profileId, medicationId, { quantityAdded: added, operationId: createOperationId() });
      setInventory(result.inventory); setCurrentQuantity(String(result.inventory.currentQuantity)); setQuantityAdded("");
    } catch (recordError) { setError(getSafeDatabaseErrorMessage(recordError, "Could not record this refill. Please try again.")); }
    finally { recordRefillGuard.current = false; setIsRecordingRefill(false); }
  }

  const canRecordRefill = Boolean(inventory?.trackingEnabled && trackingEnabled);
  const isLow = Boolean(inventory && getRefillStockState(inventory) === "low");
  if (sourceProfileId && sourceProfileId !== profileId) {
    return <View style={styles.center}><Text style={styles.helper}>This refill screen belongs to the profile you left.</Text><ThemedButton label="Go back" tone="outline" onPress={() => router.back()} accessibilityLabel="Return to the previous screen" /></View>;
  }
  return <View style={styles.container}>
    {isLoading || loadedProfileId !== profileId ? <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.helper}>Loading refill settings...</Text></View> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{medicationName || "Medication"}</Text><Text style={styles.intro}>Track an approximate remaining quantity. Stock history is an inventory record, not medical advice.</Text>
      {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><ThemedButton label="Try again" tone="outline" onPress={() => void load()} accessibilityLabel="Retry loading refill tracking" /></View> : null}
      <View style={styles.row}><View style={styles.rowText}><Text style={styles.label}>Enable refill tracking</Text><Text style={styles.helper}>Optional. It does not change your medication dosage.</Text></View><Switch value={trackingEnabled} onValueChange={setTrackingEnabled} accessibilityLabel="Enable refill tracking" trackColor={{ false: colors.disabledBackground, true: colors.primaryBackground }} /></View>
      {inventory ? <View style={styles.stockCard}><Text style={styles.label}>Current stock</Text><Text style={styles.stockValue}>{formatStockQuantity(inventory.currentQuantity, inventory.unit)}</Text>{isLow ? <Text accessibilityRole="alert" style={styles.lowStock}>Refill soon: recorded stock is at or below your warning level.</Text> : null}<Text style={styles.helper}>Use Record refill to add stock. Existing stock changes remain in the audit history.</Text></View> : <><Field label="Starting quantity" value={currentQuantity} onChangeText={setCurrentQuantity} accessibilityLabel="Starting quantity" /><Text style={styles.helper}>This initial value is not calculated from the dosage field.</Text></>}
      <Text style={styles.label}>Unit</Text><View style={styles.units}>{STOCK_UNITS.map((stockUnit) => <ThemedChip key={stockUnit} label={stockUnit} selected={unit === stockUnit} onPress={() => setUnit(stockUnit)} accessibilityLabel={`Use ${stockUnit} as stock unit`} />)}</View>
      <Field label="Used per Taken dose" value={consumptionPerTaken} onChangeText={setConsumptionPerTaken} accessibilityLabel="Used per Taken dose" />
      <Text style={styles.helper}>Mr. Pill Pal does not calculate stock use from the dosage field.</Text>
      <Field label="Low-stock warning at" value={lowStockThreshold} onChangeText={setLowStockThreshold} accessibilityLabel="Low-stock warning quantity" />
      <ThemedButton label="Save refill tracking" loadingLabel="Saving..." loading={isSaving} onPress={() => void save()} accessibilityLabel="Save refill tracking" style={styles.save} />
      {inventory ? <View style={styles.refillPanel}><Text style={styles.panelTitle}>Record refill</Text>{canRecordRefill ? <><Text style={styles.helper}>Enter only the quantity you are adding. The new total is calculated safely.</Text><Field label="Quantity added" value={quantityAdded} onChangeText={setQuantityAdded} accessibilityLabel={`Quantity added in ${inventory.unit}`} /><ThemedButton label="Record refill" loadingLabel="Recording..." loading={isRecordingRefill} disabled={isRecordingRefill} onPress={requestRecordRefill} accessibilityLabel={`Record refill for ${medicationName}`} style={styles.save} /></> : <Text style={styles.helper}>Enable refill tracking and save it before recording new stock. Existing stock history is preserved.</Text>}<ThemedButton label="Stock history" tone="outline" onPress={() => router.push({ pathname: "/stock-history" as never, params: { medicationId, profileId } })} accessibilityLabel={`View stock history for ${medicationName}`} style={styles.historyButton} /></View> : null}
    </ScrollView>}</View>;
}

function parseQuantity(value: string, label: string): number { if (!value.trim()) throw new Error(`${label} is required.`); return Number(value); }

function Field({ label, value, onChangeText, accessibilityLabel }: { label: string; value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} accessibilityLabel={accessibilityLabel} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.placeholder} style={styles.input} /></View>; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({ container:{flex:1,backgroundColor:colors.background},content:{padding:ui.spacing.screen,paddingBottom:72,gap:12},center:{flex:1,alignItems:"center",justifyContent:"center",gap:12},title:{fontSize:22,fontWeight:"800",color:colors.textPrimary},intro:{fontSize:16,lineHeight:23,color:colors.textSecondary,marginBottom:8},row:{flexDirection:"row",alignItems:"center",gap:12,padding:ui.spacing.card,borderRadius:ui.radius.card,borderWidth:1,borderColor:colors.border,backgroundColor:colors.cardBackground},rowText:{flex:1},label:{fontSize:16,fontWeight:"700",color:colors.textPrimary,marginTop:4},helper:{fontSize:14,lineHeight:20,color:colors.textSecondary,marginTop:4},input:{minHeight:52,marginTop:7,borderWidth:1,borderColor:colors.outlineBorder,borderRadius:ui.radius.button,paddingHorizontal:14,fontSize:17,color:colors.inputForeground,backgroundColor:colors.inputBackground},units:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:6},save:{marginTop:12},stockCard:{padding:ui.spacing.card,borderWidth:1,borderColor:colors.border,borderRadius:ui.radius.card,backgroundColor:colors.cardBackground},stockValue:{marginTop:6,fontSize:22,fontWeight:"800",color:colors.cardForeground},lowStock:{marginTop:10,fontSize:15,lineHeight:21,fontWeight:"800",color:colors.warning},refillPanel:{gap:8,marginTop:ui.spacing.section,padding:ui.spacing.card,borderWidth:1,borderColor:colors.borderStrong,borderRadius:ui.radius.card,backgroundColor:colors.secondaryBackground},panelTitle:{fontSize:19,fontWeight:"800",color:colors.secondaryForeground},historyButton:{marginTop:6},error:{gap:10,padding:ui.spacing.card,borderRadius:ui.radius.card,backgroundColor:colors.dangerSurface},errorText:{fontSize:15,fontWeight:"700",color:colors.dangerForeground} });
