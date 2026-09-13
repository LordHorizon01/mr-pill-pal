import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getHistoryDetail } from "@/features/history/history.service";
import { HistoryDose } from "@/features/history/history.types";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { useProfileStore } from "@/state/profile.store";
import { AppBackHeader } from "@/components/app-back-header";

export default function DoseDetailScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const [dose, setDose] = useState<HistoryDose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const loadDose = useCallback(() => {
    const currentRequest = ++requestRevision.current;
    if (!id || !profileId) { setDose(null); return () => undefined; }
    let current = true;
    setDose(null); setError(null);
    void getHistoryDetail(profileId, id).then((result) => {
      if (!current || requestRevision.current !== currentRequest) return;
      if (result) setDose(result);
      else setError("This dose record is no longer available.");
    }).catch(() => {
      if (current && requestRevision.current === currentRequest) setError("Dose details couldn't be loaded. Please try again.");
    });
    return () => { current = false; };
  }, [id, profileId]);
  useEffect(() => loadDose(), [loadDose]);
  if (!dose) return <View style={styles.page}><AppBackHeader title="Dose details" fallbackRoute="/history" />{error ? <Pressable accessibilityRole="button" accessibilityLabel="Try loading dose details again" onPress={() => void loadDose()} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.errorHint}>Tap to try again</Text></Pressable> : <ActivityIndicator size="large" style={styles.loader} />}</View>;
  return <View style={styles.page}><AppBackHeader title="Dose details" fallbackRoute="/history" /><Text style={styles.name}>{dose.medicationName}</Text><Text style={styles.dosage}>{dose.medicationDosage}</Text><View style={styles.card}><Detail label="Scheduled date" value={dose.scheduledDate} /><Detail label="Scheduled time" value={dose.scheduledTime} /><Detail label="Status" value={dose.status[0].toUpperCase() + dose.status.slice(1)} />{dose.takenAt ? <Detail label="Recorded" value={new Date(dose.takenAt).toLocaleString()} /> : null}{dose.notes ? <Detail label="Notes" value={dose.notes} /> : null}</View></View>;
}
function Detail({ label, value }: { label: string; value: string }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const createStyles = (colors: AppColorTokens) => StyleSheet.create({ page:{flex:1,padding:ui.spacing.screen,paddingTop:20,backgroundColor:colors.background},loader:{marginTop:48},error:{marginTop:ui.spacing.section,padding:ui.spacing.card,borderRadius:ui.radius.card,backgroundColor:colors.dangerBackground},errorText:{fontWeight:"700",color:colors.dangerForeground},errorHint:{marginTop:4,color:colors.textMuted},name:{marginTop:ui.spacing.section,fontSize:26,fontWeight:"700",color:colors.textPrimary},dosage:{marginTop:5,fontSize:17,color:colors.textSecondary},card:{marginTop:ui.spacing.section,padding:ui.spacing.card,borderWidth:1,borderColor:colors.border,borderTopColor:colors.borderStrong,borderRadius:ui.radius.card,backgroundColor:colors.cardBackground},detail:{paddingVertical:13,borderBottomWidth:1,borderBottomColor:colors.divider},label:{fontSize:14,fontWeight:"700",color:colors.textMuted},value:{marginTop:3,fontSize:17,color:colors.cardForeground} });
