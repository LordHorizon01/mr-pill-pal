import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AutoDismissNotice } from "@/components/auto-dismiss-notice";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { getReminderHealthLabel, getReminderProblemLabel } from "@/features/settings/reminder-health.domain";
import { ReminderSettingsOverview } from "@/features/schedules/schedule.types";
import { getReminderSettingsOverview } from "@/features/schedules/schedule.service";
import { scheduleTestNotification } from "@/notifications/notification.service";
import { useSettingsStore } from "@/state/settings.store";

export default function ReminderSettingsScreen() {
  const { colors } = useAppTheme(); const styles = createStyles(colors);
  const { hideMedicationName, isLoading: privacyLoading, error: privacyError, loadSettings, setHideMedicationName, clearError: clearPrivacyError } = useSettingsStore();
  const [overview, setOverview] = useState<ReminderSettingsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const testingRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true); setError(null);
    try { setOverview(await getReminderSettingsOverview()); }
    catch { setError("Reminder health could not be checked. Please try again."); }
    finally { setIsLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void loadSettings(); void load(); return () => setNotice(null); }, [load, loadSettings]));

  async function openDeviceSettings() {
    try { await Linking.openSettings(); }
    catch { setError("Device settings could not be opened. Please open notification settings from your phone."); }
  }

  async function testNotification() {
    if (testingRef.current) return;
    testingRef.current = true; setIsTesting(true); setError(null);
    try { await scheduleTestNotification(); setNotice("Test notification scheduled for about 5 seconds from now."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not schedule the test notification. Please try again."); }
    finally { testingRef.current = false; setIsTesting(false); }
  }

  async function changePrivacy(value: boolean) {
    try { await setHideMedicationName(value); setNotice(value ? "Medication names are now hidden in reminder text." : "Medication names may now appear in reminder text."); }
    catch { /* The shared settings store provides the safe message. */ }
  }

  const healthLabel = overview ? getReminderHealthLabel(overview) : "Checking...";
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.intro}>Review notification permission, active reminder health, privacy, and common Android reminder problems.</Text>
    <AutoDismissNotice message={notice} onDismiss={() => setNotice(null)} />
    {(error || privacyError) ? <Pressable accessibilityRole="button" onPress={() => { setError(null); clearPrivacyError(); }} style={styles.error}><Text accessibilityLiveRegion="assertive" style={styles.errorText}>{error ?? privacyError}</Text><Text style={styles.hint}>Tap to dismiss</Text></Pressable> : null}
    <Section title="Reminder health"><View style={styles.healthRow}><Text style={styles.healthLabel}>{healthLabel}</Text>{isLoading ? <ActivityIndicator /> : null}</View><Text style={styles.description}>{overview?.health === "working" ? "Notification permission and saved native reminders are currently in a healthy state." : overview?.health === "permission_required" ? "Allow notifications in device settings, then return here to recheck reminders." : overview ? "Open an affected schedule below to review or retry it." : "Checking notification permission and saved reminders."}</Text><Pressable accessibilityRole="button" accessibilityLabel="Recheck reminder health" disabled={isLoading} onPress={() => void load()} style={styles.outlineButton}><Text style={styles.outlineText}>{isLoading ? "Checking..." : "Recheck reminder health"}</Text></Pressable></Section>
    {overview?.affectedSchedules.length ? <Section title="Schedules needing attention">{overview.affectedSchedules.map((item) => <View key={item.scheduleId} style={styles.attentionRow}><View style={styles.attentionCopy}><Text style={styles.itemTitle}>{item.medicationName}</Text><Text style={styles.description}>{item.time} - {getReminderProblemLabel(item.reminderStatus)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Fix reminder for ${item.medicationName} at ${item.time}`} onPress={() => router.push({ pathname: "/schedule", params: { medicationId: item.medicationId, medicationName: item.medicationName } })} style={styles.fixButton}><Text style={styles.fixText}>Fix</Text></Pressable></View>)}</Section> : null}
    <Section title="Notification tools"><Pressable accessibilityRole="button" accessibilityLabel="Send test notification" accessibilityState={{ busy: isTesting, disabled: isTesting }} disabled={isTesting} onPress={() => void testNotification()} style={styles.primaryButton}><Text style={styles.primaryText}>{isTesting ? "Scheduling test..." : "Test notification"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open device notification settings" onPress={() => void openDeviceSettings()} style={styles.outlineButton}><Text style={styles.outlineText}>Open device notification settings</Text></Pressable></Section>
    <Section title="Lock-screen privacy"><View style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.itemTitle}>Hide medication names</Text><Text style={styles.description}>When enabled, reminder notifications use general medication text.</Text></View><Switch accessibilityLabel="Hide medication names in notification text" accessibilityState={{ disabled: privacyLoading }} disabled={privacyLoading} value={hideMedicationName} onValueChange={(value) => void changePrivacy(value)} /></View>{privacyLoading ? <ActivityIndicator style={styles.smallLoader} /> : null}</Section>
    <Section title="Not receiving reminders?"><Text style={styles.description}>Check that notifications are allowed. Android may also delay reminders when battery restrictions are strong, after the app is force-stopped, or because of device-specific background settings.</Text><Text style={styles.hint}>Mr. Pill Pal does not claim to detect battery restrictions. Open app settings to review the options available on this phone.</Text><Pressable accessibilityRole="button" accessibilityLabel="Open app settings for reminder troubleshooting" onPress={() => void openDeviceSettings()} style={styles.outlineButton}><Text style={styles.outlineText}>Open app settings</Text></Pressable></Section>
  </ScrollView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { const { colors } = useAppTheme(); const styles = createStyles(colors); return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>; }
const createStyles = (colors: AppColorTokens) => StyleSheet.create({ page:{padding:ui.spacing.screen,paddingTop:20,paddingBottom:60,backgroundColor:colors.background},intro:{fontSize:16,lineHeight:23,color:colors.textSecondary},section:{marginTop:ui.spacing.section},sectionTitle:{marginBottom:9,fontSize:17,fontWeight:"700",color:colors.textPrimary},card:{gap:14,padding:ui.spacing.card,borderWidth:1,borderColor:colors.border,borderTopColor:colors.borderStrong,borderRadius:ui.radius.card,backgroundColor:colors.cardBackground},healthRow:{minHeight:44,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},healthLabel:{fontSize:19,fontWeight:"700",color:colors.cardForeground},description:{fontSize:15,lineHeight:21,color:colors.textSecondary},hint:{fontSize:14,lineHeight:20,color:colors.textMuted},primaryButton:{minHeight:ui.touch.minimum,alignItems:"center",justifyContent:"center",paddingHorizontal:14,borderRadius:ui.radius.button,backgroundColor:colors.primaryBackground},primaryText:{fontSize:16,fontWeight:"700",color:colors.primaryForeground},outlineButton:{minHeight:ui.touch.minimum,alignItems:"center",justifyContent:"center",paddingHorizontal:14,borderRadius:ui.radius.button,borderWidth:1,borderColor:colors.outlineBorder,backgroundColor:colors.inputBackground},outlineText:{fontSize:15,fontWeight:"700",textAlign:"center",color:colors.outlineForeground},error:{marginTop:16,padding:14,borderRadius:ui.radius.button,backgroundColor:colors.dangerBackground},errorText:{fontWeight:"700",color:colors.dangerForeground},toggleRow:{flexDirection:"row",alignItems:"center",gap:12},toggleCopy:{flex:1,flexShrink:1},itemTitle:{fontSize:16,fontWeight:"700",color:colors.cardForeground},smallLoader:{alignSelf:"flex-start"},attentionRow:{minHeight:64,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:colors.divider},attentionCopy:{flex:1,flexShrink:1},fixButton:{minWidth:48,minHeight:48,alignItems:"center",justifyContent:"center"},fixText:{fontWeight:"700",color:colors.outlineForeground} });
