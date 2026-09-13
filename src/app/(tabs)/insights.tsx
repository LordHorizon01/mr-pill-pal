import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/screen-header";
import { ThemedChip } from "@/components/themed-ui";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { getRoutineInsights } from "@/features/history/history.service";
import { DetailedInsights, InsightRange } from "@/features/history/history.types";
import { calculateRoutineAdherence } from "@/features/history/insights.domain";
import { useProfileStore } from "@/state/profile.store";

const ranges: { value: InsightRange; label: string }[] = [{ value: "7", label: "7 Days" }, { value: "30", label: "30 Days" }, { value: "90", label: "90 Days" }, { value: "all", label: "All Time" }];

export default function InsightsScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const [range, setRange] = useState<InsightRange>("7"); const [data, setData] = useState<DetailedInsights | null>(null); const [error, setError] = useState<string | null>(null); const [isLoading, setIsLoading] = useState(false);
  const requestRevision = useRef(0);
  const load = useCallback((nextRange = range) => {
    const currentRequest = ++requestRevision.current;
    if (!profileId) { setData(null); setError(null); setIsLoading(false); return; }
    setIsLoading(true);
    void getRoutineInsights(profileId, nextRange).then((result) => {
      if (requestRevision.current !== currentRequest) return;
      setData(result); setError(null); setIsLoading(false);
    }).catch(() => {
      if (requestRevision.current !== currentRequest) return;
      setError("Insights couldn't be loaded. Please try again."); setIsLoading(false);
    });
  }, [profileId, range]);
  useFocusEffect(useCallback(() => { load(); return () => { requestRevision.current += 1; }; }, [load]));
  function changeRange(next: InsightRange) { setRange(next); }
  const hasData = Boolean(data && data.eligible > 0); const routineAdherence = data ? calculateRoutineAdherence(data, data.unresolvedPast) : null;
  return <ScrollView contentContainerStyle={styles.page}><ScreenHeader title="Insights" /><Text style={styles.subtitle}>A neutral summary of recorded medication routines</Text><View style={styles.ranges}>{ranges.map((item) => <ThemedChip key={item.value} label={item.label} selected={range === item.value} onPress={() => changeRange(item.value)} accessibilityLabel={`${item.label} insights${range === item.value ? ", selected" : ""}`} />)}</View>{isLoading && !data ? <ActivityIndicator size="large" style={styles.loader} /> : null}{error ? <Pressable accessibilityRole="button" accessibilityLabel="Try loading insights again" onPress={() => load()} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.errorHint}>Tap to try again</Text></Pressable> : null}{data && !hasData ? <View style={styles.empty}><Text style={styles.emptyTitle}>No dose history yet.</Text><Text style={styles.emptyText}>Record medication intake to see routine insights.</Text></View> : null}{data && hasData ? <><View style={styles.card}><Text style={styles.cardTitle}>{ranges.find((item) => item.value === range)?.label}</Text><Metric label="Total eligible" value={data.eligible} /><Metric label="Taken" value={data.taken} /><Metric label="Skipped" value={data.skipped} /><Metric label="Missed" value={data.missed} />{data.unresolvedPast ? <Text style={styles.helper}>Unresolved past doses: {data.unresolvedPast}</Text> : null}</View><View style={styles.card}><Text style={styles.cardTitle}>Routine adherence</Text><Text style={styles.percentage}>{routineAdherence}%</Text><Text style={styles.helper}>Taken eligible doses / total eligible scheduled doses. This is routine tracking only.</Text></View><View style={styles.card}><Text style={styles.cardTitle}>By medication</Text>{data.byMedication.map((medication) => <View key={medication.medicationId} style={styles.breakdown}><Text style={styles.medicationName}>{medication.medicationName}</Text><Text style={styles.breakdownText}>Taken {medication.taken}   Skipped {medication.skipped}   Missed {medication.missed}</Text></View>)}</View><View style={styles.card}><Text style={styles.cardTitle}>Daily routine records</Text>{data.trend.map((day) => <View key={day.date} style={styles.breakdown}><Text style={styles.medicationName}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text><Text style={styles.breakdownText}>Taken {day.taken}   Skipped {day.skipped}   Missed {day.missed}</Text></View>)}</View></> : null}</ScrollView>;
}
function Metric({ label, value }: { label: string; value: number }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
const createStyles = (colors: AppColorTokens) => StyleSheet.create({ page:{padding:ui.spacing.screen,paddingTop:20,paddingBottom:120,backgroundColor:colors.background},subtitle:{marginTop:18,fontSize:16,lineHeight:22,color:colors.textSecondary},ranges:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:16},loader:{marginTop:48},error:{marginTop:ui.spacing.section,padding:ui.spacing.card,borderRadius:ui.radius.card,backgroundColor:colors.dangerBackground},errorText:{fontWeight:"700",color:colors.dangerForeground},errorHint:{color:colors.textMuted},empty:{marginTop:ui.spacing.section,padding:ui.spacing.card,borderRadius:ui.radius.card,borderWidth:1,borderColor:colors.border,backgroundColor:colors.cardBackground},emptyTitle:{fontSize:18,fontWeight:"700",color:colors.cardForeground},emptyText:{marginTop:6,fontSize:16,lineHeight:22,color:colors.textSecondary},card:{marginTop:ui.spacing.section,padding:ui.spacing.card,borderWidth:1,borderColor:colors.border,borderTopColor:colors.borderStrong,borderRadius:ui.radius.card,backgroundColor:colors.cardBackground},cardTitle:{fontSize:18,fontWeight:"700",color:colors.cardForeground},metric:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:colors.divider},metricLabel:{fontSize:16,fontWeight:"600",color:colors.textPrimary},metricValue:{fontSize:19,fontWeight:"700",color:colors.primary},percentage:{marginTop:12,fontSize:34,fontWeight:"700",color:colors.primary},helper:{marginTop:10,fontSize:14,lineHeight:20,color:colors.textMuted},breakdown:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.divider},medicationName:{fontSize:16,fontWeight:"700",color:colors.cardForeground},breakdownText:{marginTop:4,fontSize:15,lineHeight:21,color:colors.textSecondary} });
