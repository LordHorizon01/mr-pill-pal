import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { useAppTheme } from "@/components/app-theme-provider";
import { ThemedButton } from "@/components/themed-ui";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { getSafeDatabaseErrorMessage } from "@/database/database";
import { getMedication } from "@/features/medications/medication.service";
import { getStockHistoryPresentation } from "@/features/refills/stock-history.domain";
import { getStockHistory } from "@/features/refills/refill.service";
import { StockHistoryEvent } from "@/features/refills/refill.types";
import { useProfileStore } from "@/state/profile.store";
import { useUserPullRefresh } from "@/hooks/use-user-pull-refresh";

function formatTimestamp(timestamp: string): string { return new Date(timestamp).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); }

export default function StockHistoryScreen() {
  const { medicationId, profileId: sourceProfileId } = useLocalSearchParams<{ medicationId?: string; profileId?: string }>();
  const profileId = useProfileStore((state) => state.selectedProfileId);
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [name, setName] = useState("Medication");
  const [events, setEvents] = useState<StockHistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++loadRequestRef.current;
    setEvents([]);
    setName("Medication");
    setLoadedProfileId(null);
    setIsLoading(true);
    setError(null);
    if (!profileId || !medicationId || (sourceProfileId && sourceProfileId !== profileId)) { setError("This stock history belongs to a different profile."); setIsLoading(false); return; }
    try {
      const [medication, history] = await Promise.all([getMedication(profileId, medicationId), getStockHistory(profileId, medicationId)]);
      if (request !== loadRequestRef.current) return;
      if (!medication) throw new Error("Medication not found.");
      setName(medication.name); setEvents(history); setLoadedProfileId(profileId);
    } catch (loadError) { if (request === loadRequestRef.current) setError(getSafeDatabaseErrorMessage(loadError, "Could not load stock history. Please try again.")); }
    finally { if (request === loadRequestRef.current) setIsLoading(false); }
  }, [medicationId, profileId, sourceProfileId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const { refreshing: userPullRefreshing, onRefresh: refreshFromPull } = useUserPullRefresh(load);
  const profileContextMismatch = Boolean(sourceProfileId && sourceProfileId !== profileId);

  return <View style={styles.container}><FlatList data={loadedProfileId === profileId ? events : []} keyExtractor={(item) => item.id} refreshing={userPullRefreshing} onRefresh={refreshFromPull} contentContainerStyle={styles.list} ListHeaderComponent={<><Text style={styles.title}>{loadedProfileId === profileId ? name : "Stock history"}</Text><Text style={styles.intro}>A local record of inventory changes. It does not provide medical advice.</Text>{error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><ThemedButton label="Try again" tone="outline" onPress={() => void load()} accessibilityLabel="Retry loading stock history" /></View> : null}{!profileContextMismatch && (isLoading || loadedProfileId !== profileId) && !events.length ? <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.helper}>Loading stock history...</Text></View> : null}</>} renderItem={({ item }) => <HistoryCard event={item} />} ListEmptyComponent={!isLoading && !error && loadedProfileId === profileId ? <View style={styles.empty}><Text style={styles.emptyTitle}>No stock changes recorded yet.</Text><Text style={styles.helper}>Refills and recorded dose stock changes will appear here.</Text></View> : null} /></View>;
}

function HistoryCard({ event }: { event: StockHistoryEvent }) { const { colors } = useAppTheme(); const styles = createStyles(colors); const presentation = getStockHistoryPresentation(event); return <View accessible accessibilityLabel={`${presentation.label}. ${presentation.delta}. ${presentation.change}. ${formatTimestamp(event.createdAt)}`} style={styles.card}><Text style={styles.eventLabel}>{presentation.label}</Text><Text style={[styles.delta, event.quantityDelta < 0 ? styles.negative : styles.positive]}>{presentation.delta}</Text><Text style={styles.change}>{presentation.change}</Text><Text style={styles.timestamp}>{formatTimestamp(event.createdAt)}</Text>{!presentation.hasUnitSnapshot ? <Text style={styles.legacy}>This older record does not have a saved unit.</Text> : null}</View>; }

const createStyles = (colors: AppColorTokens) => StyleSheet.create({ container:{flex:1,backgroundColor:colors.background},list:{padding:ui.spacing.screen,paddingTop:ui.spacing.screen,paddingBottom:72},title:{fontSize:22,fontWeight:"800",color:colors.textPrimary},intro:{marginTop:5,fontSize:16,lineHeight:23,color:colors.textSecondary},card:{marginTop:12,padding:ui.spacing.card,borderWidth:1,borderColor:colors.border,borderRadius:ui.radius.card,backgroundColor:colors.cardBackground},eventLabel:{fontSize:17,fontWeight:"800",color:colors.cardForeground},delta:{marginTop:6,fontSize:18,fontWeight:"800"},positive:{color:colors.success},negative:{color:colors.danger},change:{marginTop:6,fontSize:15,fontWeight:"600",color:colors.textSecondary},timestamp:{marginTop:8,fontSize:14,color:colors.textMuted},legacy:{marginTop:6,fontSize:13,lineHeight:18,color:colors.textMuted},center:{alignItems:"center",paddingVertical:36,gap:10},empty:{alignItems:"center",paddingVertical:48,paddingHorizontal:20},emptyTitle:{fontSize:18,fontWeight:"800",color:colors.textPrimary,textAlign:"center"},helper:{fontSize:14,lineHeight:20,color:colors.textSecondary,textAlign:"center"},error:{gap:10,marginTop:16,padding:ui.spacing.card,borderRadius:ui.radius.card,backgroundColor:colors.dangerSurface},errorText:{fontSize:15,fontWeight:"700",color:colors.dangerForeground} });
