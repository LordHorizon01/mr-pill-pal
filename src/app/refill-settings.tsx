import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppBackHeader } from "@/components/app-back-header";
import { useAppTheme } from "@/components/app-theme-provider";
import { ThemedButton, ThemedChip } from "@/components/themed-ui";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { getMedication } from "@/features/medications/medication.service";
import { getRefillTracking, saveRefillTracking } from "@/features/refills/refill.service";
import { STOCK_UNITS, StockUnit } from "@/features/refills/refill.types";
import { useProfileStore } from "@/state/profile.store";

const defaults = { currentQuantity: "0", unit: "tablets" as StockUnit, consumptionPerTaken: "1", lowStockThreshold: "0" };

export default function RefillSettingsScreen() {
  const { medicationId } = useLocalSearchParams<{ medicationId?: string }>();
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [medicationName, setMedicationName] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [currentQuantity, setCurrentQuantity] = useState(defaults.currentQuantity);
  const [unit, setUnit] = useState<StockUnit>(defaults.unit);
  const [consumptionPerTaken, setConsumptionPerTaken] = useState(defaults.consumptionPerTaken);
  const [lowStockThreshold, setLowStockThreshold] = useState(defaults.lowStockThreshold);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId || !medicationId) { setError("Medication details are unavailable."); setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const [medication, inventory] = await Promise.all([getMedication(profileId, medicationId), getRefillTracking(profileId, medicationId)]);
      if (!medication) throw new Error("Medication not found.");
      setMedicationName(medication.name);
      if (inventory) {
        setTrackingEnabled(inventory.trackingEnabled); setCurrentQuantity(String(inventory.currentQuantity)); setUnit(inventory.unit);
        setConsumptionPerTaken(String(inventory.consumptionPerTaken)); setLowStockThreshold(String(inventory.lowStockThreshold));
      }
    } catch { setError("Could not load refill tracking. Please try again."); }
    finally { setIsLoading(false); }
  }, [medicationId, profileId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!profileId || !medicationId) return;
    setIsSaving(true); setError(null);
    try {
      await saveRefillTracking(profileId, medicationId, { trackingEnabled, currentQuantity: parseQuantity(currentQuantity, "Current quantity"), unit, consumptionPerTaken: parseQuantity(consumptionPerTaken, "Used per Taken dose"), lowStockThreshold: parseQuantity(lowStockThreshold, "Low-stock warning") });
      router.back();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save refill tracking. Please try again."); }
    finally { setIsSaving(false); }
  }

  return <View style={styles.container}><AppBackHeader fallbackRoute="/medications" title="Refill tracking" />
    {isLoading ? <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.helper}>Loading refill settings...</Text></View> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{medicationName || "Medication"}</Text><Text style={styles.intro}>Track an approximate remaining quantity and get low-stock reminders later.</Text>
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><ThemedButton label="Try again" tone="outline" onPress={() => void load()} accessibilityLabel="Retry loading refill tracking" /></View> : null}
      <View style={styles.row}><View style={styles.rowText}><Text style={styles.label}>Enable refill tracking</Text><Text style={styles.helper}>Optional. It does not change your medication dosage.</Text></View><Switch value={trackingEnabled} onValueChange={setTrackingEnabled} accessibilityLabel="Enable refill tracking" trackColor={{ false: colors.disabledBackground, true: colors.primaryBackground }} /></View>
      <Field label="Current quantity" value={currentQuantity} onChangeText={setCurrentQuantity} accessibilityLabel="Current quantity" />
      <Text style={styles.label}>Unit</Text><View style={styles.units}>{STOCK_UNITS.map((stockUnit) => <ThemedChip key={stockUnit} label={stockUnit} selected={unit === stockUnit} onPress={() => setUnit(stockUnit)} accessibilityLabel={`Use ${stockUnit} as stock unit`} />)}</View>
      <Field label="Used per Taken dose" value={consumptionPerTaken} onChangeText={setConsumptionPerTaken} accessibilityLabel="Used per Taken dose" />
      <Text style={styles.helper}>This is your inventory value. Mr. Pill Pal does not calculate it from the dosage field.</Text>
      <Field label="Low-stock warning at" value={lowStockThreshold} onChangeText={setLowStockThreshold} accessibilityLabel="Low-stock warning quantity" />
      <ThemedButton label={isSaving ? "Saving..." : "Save refill tracking"} loading={isSaving} onPress={() => void save()} accessibilityLabel="Save refill tracking" style={styles.save} />
    </ScrollView>}</View>;
}

function parseQuantity(value: string, label: string): number {
  if (!value.trim()) throw new Error(`${label} is required.`);
  return Number(value);
}

function Field({ label, value, onChangeText, accessibilityLabel }: { label: string; value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} accessibilityLabel={accessibilityLabel} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.placeholder} style={styles.input} /></View>; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({ container:{flex:1,backgroundColor:colors.background},content:{padding:ui.spacing.screen,paddingBottom:56,gap:12},center:{flex:1,alignItems:"center",justifyContent:"center",gap:12},title:{fontSize:22,fontWeight:"800",color:colors.textPrimary},intro:{fontSize:16,lineHeight:23,color:colors.textSecondary,marginBottom:8},row:{flexDirection:"row",alignItems:"center",gap:12,padding:ui.spacing.card,borderRadius:ui.radius.card,borderWidth:1,borderColor:colors.border,backgroundColor:colors.cardBackground},rowText:{flex:1},label:{fontSize:16,fontWeight:"700",color:colors.textPrimary,marginTop:4},helper:{fontSize:14,lineHeight:20,color:colors.textSecondary,marginTop:4},input:{minHeight:52,marginTop:7,borderWidth:1,borderColor:colors.outlineBorder,borderRadius:ui.radius.button,paddingHorizontal:14,fontSize:17,color:colors.inputForeground,backgroundColor:colors.inputBackground},units:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:6},save:{marginTop:12},error:{gap:10,padding:ui.spacing.card,borderRadius:ui.radius.card,backgroundColor:colors.dangerSurface},errorText:{fontSize:15,fontWeight:"700",color:colors.dangerForeground} });
