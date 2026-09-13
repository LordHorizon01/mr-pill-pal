import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

import { scheduleTestNotification } from "@/notifications/notification.service";
import { useSchedules } from "@/hooks/useSchedules";
import { useSettingsStore } from "@/state/settings.store";
import { AutoDismissNotice } from "@/components/auto-dismiss-notice";
import { AppColorTokens, ui } from "@/components/ui-tokens";
import { useAppTheme } from "@/components/app-theme-provider";
import { BadgeTone, StatusBadge } from "@/components/themed-ui";
import { hasScheduleChanges } from "@/features/schedules/schedule-edit.domain";
import type { MedicationSchedule, ReminderStatus } from "@/features/schedules/schedule.types";

const WEEK_DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

const RAPID_TAP_GUARD_MS = 750;

type ScheduleMode = "one_time" | "recurring";

type ScheduleStatusInfo = {
  label: string;
  description?: string;
  action?: "Pause" | "Resume" | "Enable notifications" | "Retry";
};

function getScheduleStatusInfo(
  reminderStatus: ReminderStatus,
): ScheduleStatusInfo {
  switch (reminderStatus) {
    case "active":
      return { label: "Reminders on", action: "Pause" };
    case "paused":
      return { label: "Paused", action: "Resume" };
    case "permission_required":
      return {
        label: "Notifications disabled",
        description: "Enable notifications to start this reminder.",
        action: "Enable notifications",
      };
    case "scheduling_failed":
      return {
        label: "Reminder setup failed",
        description: "The reminder was not scheduled on this phone.",
        action: "Retry",
      };
    case "expired":
      return {
        label: "Expired",
        description: "This one-time reminder has already passed.",
      };
  }
}

function getScheduleStatusTone(reminderStatus: ReminderStatus): BadgeTone {
  if (reminderStatus === "active") return "active";
  if (reminderStatus === "paused") return "paused";
  if (reminderStatus === "expired") return "expired";
  if (reminderStatus === "permission_required") return "pending";
  return "missed";
}

function getScheduleDescription(schedule: {
  type: ScheduleMode;
  startDate: string;
  repeatDays?: number[];
}): string {
  if (schedule.type === "one_time") {
    return `Once · ${schedule.startDate}`;
  }

  const repeatDays = schedule.repeatDays ?? [];

  if (repeatDays.length === 7) {
    return "Every day";
  }

  const dayLabels = WEEK_DAYS
    .filter((day) => repeatDays.includes(day.value))
    .map((day) => day.label);

  return dayLabels.length > 0
    ? dayLabels.join(", ")
    : "Repeating";
}

function localDateFromString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function timeFromString(value: string): Date {
  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date();
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function getScheduleSummary(schedule: Pick<MedicationSchedule, "type" | "time" | "startDate" | "repeatDays">): string {
  return `${getScheduleDescription(schedule)} at ${format(timeFromString(schedule.time), "h:mm a")}`;
}

export default function ScheduleScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const { medicationId, medicationName } =
    useLocalSearchParams<{
      medicationId: string;
      medicationName?: string;
    }>();

  const {
    schedules,
    isLoading,
    error,
    loadSchedules,
    createSchedule,
    pauseSchedule,
    resumeSchedule,
    updateSchedule,
    deleteSchedule,
    clearError,
  } = useSchedules();

  const [selectedTime, setSelectedTime] = useState(() => {
    const time = new Date();
    time.setHours(9, 0, 0, 0);
    return time;
  });

  const [scheduleMode, setScheduleMode] =
    useState<ScheduleMode>("recurring");

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [selectedDays, setSelectedDays] =
    useState<number[]>([
      0, 1, 2, 3, 4, 5, 6,
    ]);

  const [isSaving, setIsSaving] =
    useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [testNotificationMessage, setTestNotificationMessage] = useState<
    string | null
  >(null);
  const [testNotificationFailed, setTestNotificationFailed] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<MedicationSchedule | null>(null);
  const isSavingRef = useRef(false);
  const isTestingNotificationRef = useRef(false);
  const isChangingPrivacyRef = useRef(false);
  const createScheduleUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testNotificationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideMedicationName = useSettingsStore(
    (state) => state.hideMedicationName,
  );
  const isLoadingPrivacy = useSettingsStore((state) => state.isLoading);
  const privacyError = useSettingsStore((state) => state.error);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const setHideMedicationName = useSettingsStore(
    (state) => state.setHideMedicationName,
  );
  const clearPrivacyError = useSettingsStore((state) => state.clearError);

  const isEveryDaySelected =
    selectedDays.length === 7;
  const editValuesChanged = useMemo(() => editingSchedule ? hasScheduleChanges(editingSchedule, {
    time: format(selectedTime, "HH:mm"),
    startDate: format(selectedDate, "yyyy-MM-dd"),
    repeatDays: editingSchedule.type === "recurring" ? selectedDays : undefined,
  }) : true, [editingSchedule, selectedDate, selectedDays, selectedTime]);

  useEffect(() => {
    if (medicationId) {
      loadSchedules(medicationId);
    }
  }, [medicationId, loadSchedules]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    return () => {
      if (createScheduleUnlockTimerRef.current) {
        clearTimeout(createScheduleUnlockTimerRef.current);
      }

      if (testNotificationUnlockTimerRef.current) {
        clearTimeout(testNotificationUnlockTimerRef.current);
      }
    };
  }, []);

  function releaseCreateScheduleLock() {
    createScheduleUnlockTimerRef.current = setTimeout(() => {
      isSavingRef.current = false;
      createScheduleUnlockTimerRef.current = null;
      setIsSaving(false);
    }, RAPID_TAP_GUARD_MS);
  }

  function releaseTestNotificationLock() {
    testNotificationUnlockTimerRef.current = setTimeout(() => {
      isTestingNotificationRef.current = false;
      testNotificationUnlockTimerRef.current = null;
      setIsTestingNotification(false);
    }, RAPID_TAP_GUARD_MS);
  }

  function toggleDay(day: number) {
    setSelectedDays((currentDays) =>
      currentDays.includes(day)
        ? currentDays.filter(
            (selectedDay) =>
              selectedDay !== day
          )
        : [...currentDays, day].sort(
            (a, b) => a - b
          )
    );
  }

  function selectEveryDay() {
    setSelectedDays([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  }

  function resetForm() {
    const time = new Date();
    time.setHours(9, 0, 0, 0);
    setEditingSchedule(null);
    setScheduleMode("recurring");
    setSelectedTime(time);
    setSelectedDate(new Date());
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setFormMessage(null);
  }

  function beginEditing(schedule: MedicationSchedule) {
    if (schedule.reminderStatus === "expired") return;
    setEditingSchedule(schedule);
    setScheduleMode(schedule.type);
    setSelectedTime(timeFromString(schedule.time));
    setSelectedDate(localDateFromString(schedule.startDate));
    setSelectedDays(schedule.repeatDays ?? [0, 1, 2, 3, 4, 5, 6]);
    setFormMessage(null);
    setSuccessMessage(null);
  }

  function handleDateValueChange(
    _event: DateTimePickerChangeEvent,
    date?: Date,
  ) {
    if (date) {
      setSelectedDate(date);
      setShowDatePicker(false);
    }
  }

  function handleTimeValueChange(
    _event: DateTimePickerChangeEvent,
    time?: Date,
  ) {
    if (time) {
      setSelectedTime(time);
      setShowTimePicker(false);
    }
  }

  function isSelectedOneTimeInThePast(): boolean {
    const reminderDate = new Date(selectedDate);

    reminderDate.setHours(
      selectedTime.getHours(),
      selectedTime.getMinutes(),
      0,
      0,
    );

    return reminderDate.getTime() <= Date.now();
  }

  async function handleSaveSchedule() {
    if (!medicationId || isSavingRef.current) {
      return;
    }

    if (scheduleMode === "one_time" && isSelectedOneTimeInThePast()) {
      setFormMessage(
        "Choose a time later than now, or choose a future date for this one-time reminder.",
      );
      return;
    }

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      setFormMessage(null);

      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, {
          time: format(selectedTime, "HH:mm"),
          startDate: format(selectedDate, "yyyy-MM-dd"),
          repeatDays: editingSchedule.type === "recurring" ? selectedDays : undefined,
        });
        setSuccessMessage("Schedule updated.");
        resetForm();
        return;
      }

      if (scheduleMode === "one_time") {
        await createSchedule({
          medicationId,
          type: "one_time",
          time: format(selectedTime, "HH:mm"),
          startDate: format(selectedDate, "yyyy-MM-dd"),
        });

        return;
      }

      await createSchedule({
        medicationId,
        type: "recurring",
        time: format(selectedTime, "HH:mm"),
        startDate: format(selectedDate, "yyyy-MM-dd"),
        repeatDays: selectedDays,
      });
      setSuccessMessage("Schedule added.");
    } catch {
      // Store already contains the error.
    } finally {
      releaseCreateScheduleLock();
    }
  }

  function requestSaveSchedule() {
    if (scheduleMode === "one_time" && isSelectedOneTimeInThePast()) {
      setFormMessage(
        "Choose a time later than now, or choose a future date for this one-time reminder.",
      );
      return;
    }

    if (!editingSchedule) {
      void handleSaveSchedule();
      return;
    }

    if (!editValuesChanged) return;
    const nextSchedule = {
      ...editingSchedule,
      time: format(selectedTime, "HH:mm"),
      startDate: format(selectedDate, "yyyy-MM-dd"),
      repeatDays: editingSchedule.type === "recurring" ? selectedDays : undefined,
    };
    Alert.alert("Save schedule changes?", `Current:\n${getScheduleSummary(editingSchedule)}\n\nNew:\n${getScheduleSummary(nextSchedule)}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Save Changes", onPress: () => void handleSaveSchedule() },
    ]);
  }

  async function handleTestNotification() {
    if (isTestingNotificationRef.current) {
      return;
    }

    try {
      isTestingNotificationRef.current = true;
      setIsTestingNotification(true);
      setTestNotificationMessage(null);
      setTestNotificationFailed(false);
      await scheduleTestNotification();
      setTestNotificationMessage(
        "Test reminder scheduled. It should appear in about 5 seconds.",
      );
    } catch (error) {
      setTestNotificationFailed(true);
      setTestNotificationMessage(
        error instanceof Error
          ? error.message
          : "Could not schedule the test reminder.",
      );
    } finally {
      releaseTestNotificationLock();
    }
  }

  async function handlePrivacyChange() {
    if (isChangingPrivacyRef.current) {
      return;
    }

    try {
      isChangingPrivacyRef.current = true;
      setPrivacyMessage(null);
      await setHideMedicationName(!hideMedicationName);
      setPrivacyMessage(
        !hideMedicationName
          ? "Privacy is on. Medicine names are hidden in future and existing reminders."
          : "Privacy is off. Medicine names can appear in reminder text.",
      );
    } catch {
      // The settings store contains the error message.
    } finally {
      isChangingPrivacyRef.current = false;
    }
  }

  function handleDeleteSchedule(schedule: (typeof schedules)[number]) {
    Alert.alert(
      "Delete this reminder?",
      `This will remove the ${schedule.time} reminder (${getScheduleDescription(
        schedule,
      )}).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete reminder",
          style: "destructive",
          onPress: () => {
            void deleteSchedule(schedule.id).catch(() => {
              // The schedule store shows the error in the screen.
            });
          },
        },
      ],
    );
  }

  async function handlePauseOrResumeSchedule(
    schedule: (typeof schedules)[number],
  ) {
    try {
      if (schedule.reminderStatus === "active") {
        await pauseSchedule(schedule.id);
      } else if (schedule.reminderStatus !== "expired") {
        await resumeSchedule(schedule.id);
      }
    } catch {
      // The schedule store shows the error in the screen.
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={
        styles.contentContainer
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>
        {editingSchedule ? "Edit Schedule" : "Medication Schedule"}
      </Text>

      <Text style={styles.medicationName}>
        {medicationName ?? "Medication"}
      </Text>

      <AutoDismissNotice message={successMessage} onDismiss={() => setSuccessMessage(null)} />

      {error ? (
        <Pressable
          style={styles.errorBox}
          onPress={clearError}
          accessibilityRole="button"
          accessibilityLabel={`Schedule problem: ${error}. Tap to dismiss.`}
        >
          <Text accessibilityLiveRegion="assertive">{error}</Text>

          <Text style={styles.errorHint}>
            Tap to dismiss
          </Text>
        </Pressable>
      ) : null}

      {privacyError ? (
        <Pressable
          style={styles.errorBox}
          onPress={clearPrivacyError}
          accessibilityRole="button"
          accessibilityLabel={`Privacy problem: ${privacyError}. Tap to dismiss.`}
        >
          <Text accessibilityLiveRegion="assertive">{privacyError}</Text>
          <Text style={styles.errorHint}>Tap to dismiss</Text>
        </Pressable>
      ) : null}

      {formMessage ? (
        <Pressable
          style={styles.errorBox}
          onPress={() => setFormMessage(null)}
          accessibilityRole="button"
          accessibilityLabel={`${formMessage}. Tap to dismiss.`}
        >
          <Text accessibilityLiveRegion="assertive">{formMessage}</Text>
          <Text style={styles.errorHint}>Tap to dismiss</Text>
        </Pressable>
      ) : null}

      {/* Schedule type */}

      <Text style={styles.label}>
        Schedule type
      </Text>

      <View style={styles.modeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="One-time reminder"
          accessibilityHint="Choose one date and time for this reminder"
          accessibilityState={{
            selected:
              scheduleMode === "one_time",
            disabled: Boolean(editingSchedule),
          }}
          disabled={Boolean(editingSchedule)}
          onPress={() =>
            setScheduleMode("one_time")
          }
          style={[
            styles.modeButton,
            scheduleMode === "one_time" &&
              styles.modeButtonSelected,
            editingSchedule && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[
              styles.modeButtonText,
              scheduleMode === "one_time" &&
                styles.modeButtonTextSelected,
            ]}
          >
            Once
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Repeating reminder"
          accessibilityHint="Choose days of the week and a reminder time"
          accessibilityState={{
            selected:
              scheduleMode === "recurring",
            disabled: Boolean(editingSchedule),
          }}
          disabled={Boolean(editingSchedule)}
          onPress={() =>
            setScheduleMode("recurring")
          }
          style={[
            styles.modeButton,
            scheduleMode === "recurring" &&
              styles.modeButtonSelected,
            editingSchedule && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[
              styles.modeButtonText,
              scheduleMode === "recurring" &&
                styles.modeButtonTextSelected,
            ]}
          >
            Repeating
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>
        {scheduleMode === "one_time" ? "Reminder date" : "Start date"}
      </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reminder date: ${format(
              selectedDate,
              "EEEE, d MMMM yyyy",
            )}`}
            accessibilityHint="Opens the phone date picker"
            onPress={() => setShowDatePicker(true)}
            style={styles.pickerButton}
          >
            <Text style={styles.pickerValue}>
              {format(selectedDate, "EEE, d MMM yyyy")}
            </Text>
            <Text style={styles.pickerHint}>Choose date</Text>
          </Pressable>

          {showDatePicker ? (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              minimumDate={scheduleMode === "one_time" ? new Date() : undefined}
              onValueChange={handleDateValueChange}
              onDismiss={() => setShowDatePicker(false)}
            />
          ) : null}

      {/* Recurring weekdays */}

      {scheduleMode === "recurring" ? (
        <>
          <Text style={styles.label}>
            Repeat on
          </Text>

          <View style={styles.daysContainer}>
            {WEEK_DAYS.map((day) => {
              const isSelected =
                selectedDays.includes(
                  day.value
                );

              return (
                <Pressable
                  key={day.value}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.label}, ${
                    isSelected ? "selected" : "not selected"
                  }`}
                  accessibilityState={{
                    selected: isSelected,
                  }}
                  onPress={() =>
                    toggleDay(day.value)
                  }
                  style={[
                    styles.dayButton,
                    isSelected &&
                      styles.dayButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      isSelected &&
                        styles.dayButtonTextSelected,
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Every day"
            accessibilityHint="Selects all seven days"
            accessibilityState={{
              selected:
                isEveryDaySelected,
            }}
            onPress={selectEveryDay}
            style={[
              styles.everyDayButton,
              isEveryDaySelected &&
                styles.everyDayButtonSelected,
            ]}
          >
            <Text
              style={[
                styles.everyDayButtonText,
                isEveryDaySelected &&
                  styles.everyDayButtonTextSelected,
              ]}
            >
              Every day
            </Text>
          </Pressable>
        </>
      ) : null}

      {/* Reminder time */}

      <Text style={styles.label}>
        Reminder time
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reminder time: ${format(selectedTime, "h:mm a")}`}
        accessibilityHint="Opens the phone time picker"
        onPress={() => setShowTimePicker(true)}
        style={styles.pickerButton}
      >
        <Text style={styles.pickerValue}>
          {format(selectedTime, "h:mm a")}
        </Text>
        <Text style={styles.pickerHint}>Choose time</Text>
      </Pressable>

      {showTimePicker ? (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          is24Hour
          onValueChange={handleTimeValueChange}
          onDismiss={() => setShowTimePicker(false)}
        />
      ) : null}

      <View style={styles.formActionRow}>
      {editingSchedule ? <Pressable accessibilityRole="button" accessibilityLabel="Cancel schedule editing" disabled={isSaving} onPress={resetForm} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editingSchedule ? "Save schedule changes" : scheduleMode === "one_time" ? "Add one-time schedule" : "Add repeating schedule"}
        accessibilityState={{ disabled: isSaving || Boolean(editingSchedule && !editValuesChanged), busy: isSaving }}
        disabled={isSaving || Boolean(editingSchedule && !editValuesChanged)}
        onPress={requestSaveSchedule}
        style={[styles.primaryButton, Boolean(editingSchedule && !editValuesChanged) && styles.buttonDisabled]}
      >
        <Text
          style={styles.primaryButtonText}
        >
          {isSaving
            ? "Saving..."
            : editingSchedule
              ? "Save Changes"
            : scheduleMode === "one_time"
              ? "Add One-Time Schedule"
              : "Add Repeating Schedule"}
        </Text>
      </Pressable>
      </View>
      {editingSchedule && !editValuesChanged ? <Text style={styles.noChanges}>No changes to save.</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Test notification"
        accessibilityHint="Schedules a test reminder for about five seconds from now"
        accessibilityState={{ busy: isTestingNotification }}
        disabled={isTestingNotification}
        onPress={handleTestNotification}
        style={styles.testButton}
      >
        <Text style={styles.testButtonText}>
          {isTestingNotification ? "Scheduling test..." : "Test Notification"}
        </Text>
      </Pressable>

      {testNotificationMessage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${testNotificationFailed ? "Test failed" : "Test scheduled"}: ${testNotificationMessage}. Tap to dismiss.`}
          onPress={() => setTestNotificationMessage(null)}
          style={[
            styles.feedbackBox,
            testNotificationFailed && styles.feedbackBoxError,
          ]}
        >
          <Text accessibilityLiveRegion="polite" style={[styles.feedbackText, testNotificationFailed && styles.feedbackTextError]}>
            {testNotificationMessage}
          </Text>
          <Text style={styles.errorHint}>Tap to dismiss</Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>Lock-screen privacy</Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Hide medicine name on lock screen"
        accessibilityHint="Applies this choice to all active reminders"
        accessibilityState={{ checked: hideMedicationName, disabled: isLoadingPrivacy }}
        disabled={isLoadingPrivacy}
        onPress={handlePrivacyChange}
        style={[
          styles.privacyButton,
          hideMedicationName && styles.privacyButtonEnabled,
        ]}
      >
        <Text style={styles.privacyTitle}>
          {hideMedicationName ? "Hide medicine name: On" : "Hide medicine name: Off"}
        </Text>
        <Text style={styles.privacyDescription}>
          {hideMedicationName
            ? "Notifications use general reminder text."
            : "Notifications can show the medicine name."}
        </Text>
      </Pressable>

      {privacyMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.privacyMessage}>
          {privacyMessage}
        </Text>
      ) : null}

      {/* Saved schedules */}

      <Text style={styles.sectionTitle}>
        Saved Schedules
      </Text>

      {isLoading ? (
        <ActivityIndicator size="large" />
      ) : schedules.length === 0 ? (
        <Text style={styles.emptyText}>
          No schedules yet.
        </Text>
      ) : (
        schedules.map((schedule) => {
          const statusInfo = getScheduleStatusInfo(schedule.reminderStatus);

          return (
            <View
            key={schedule.id}
            style={styles.scheduleCard}
          >
            <View
              style={
                styles.scheduleInformation
              }
            >
              <Text
                style={styles.scheduleTime}
              >
                {schedule.time}
              </Text>

              <StatusBadge label={statusInfo.label} tone={getScheduleStatusTone(schedule.reminderStatus)} />

              {statusInfo.description ? (
                <Text style={styles.statusDescription}>
                  {statusInfo.description}
                </Text>
              ) : null}

              <Text
                style={styles.repeatText}
              >
                {getScheduleDescription(
                  schedule
                )}
              </Text>
            </View>

            <View style={styles.actions}>
              {schedule.reminderStatus !== "expired" ? <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${schedule.time} reminder`}
                onPress={() => beginEditing(schedule)}
                style={styles.actionButton}
              ><Text style={styles.actionButtonText}>Edit</Text></Pressable> : null}
              {statusInfo.action ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${statusInfo.action} ${schedule.time} reminder`}
                  onPress={() => void handlePauseOrResumeSchedule(schedule)}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionButtonText}>{statusInfo.action}</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${schedule.time} reminder`}
                onPress={() => handleDeleteSchedule(schedule)}
                style={styles.actionButton}
              >
                <Text style={styles.deleteActionText}>Delete</Text>
              </Pressable>
            </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const createStyles = (colors: AppColorTokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
  },

  medicationName: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 18,
    color: colors.textSecondary,
  },

  label: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: "600",
  },

  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },

  modeButton: { flex: 1, minHeight: ui.touch.minimum, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, alignItems: "center", justifyContent: "center", backgroundColor: colors.inputBackground },
  modeButtonSelected: { backgroundColor: colors.selectedBackground, borderColor: colors.selectedBackground },
  modeButtonText: { fontSize: 15, fontWeight: "600", color: colors.inputForeground },
  modeButtonTextSelected: { color: colors.selectedForeground },

  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },

  dayButton: { minWidth: 44, minHeight: ui.touch.minimum, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.chip, alignItems: "center", justifyContent: "center", backgroundColor: colors.inputBackground },
  dayButtonSelected: { backgroundColor: colors.selectedBackground, borderColor: colors.selectedBackground },
  dayButtonText: { fontSize: 13, fontWeight: "600", color: colors.inputForeground },
  dayButtonTextSelected: { color: colors.selectedForeground },

  everyDayButton: { minHeight: ui.touch.minimum, marginBottom: 12, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, backgroundColor: colors.inputBackground },
  everyDayButtonSelected: { backgroundColor: colors.selectedBackground },
  everyDayButtonText: { fontSize: 14, fontWeight: "600", color: colors.inputForeground },
  everyDayButtonTextSelected: { color: colors.selectedForeground },

  pickerButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, paddingHorizontal: 16, backgroundColor: colors.inputBackground },
  pickerValue: { fontSize: 17, fontWeight: "600", color: colors.inputForeground },
  pickerHint: { fontSize: 14, color: colors.textMuted },

  primaryButton: { flex: 1, minHeight: 52, marginTop: 12, borderRadius: ui.radius.button, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryBackground },

  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "600",
  },

  testButton: { minHeight: 52, marginTop: 12, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, alignItems: "center", justifyContent: "center", backgroundColor: colors.inputBackground },
  testButtonText: { fontSize: 16, fontWeight: "600", color: colors.outlineForeground },

  formActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  cancelButton: { minHeight: 52, marginTop: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, backgroundColor: colors.inputBackground },
  cancelButtonText: { color: colors.outlineForeground, fontSize: 16, fontWeight: "700" },
  noChanges: { marginTop: 7, color: colors.textMuted, fontSize: 14 },

  buttonDisabled: {
    opacity: 0.45,
  },

  feedbackBox: { marginTop: 12, padding: 14, borderRadius: ui.radius.button, backgroundColor: colors.badgeTakenBackground },
  feedbackBoxError: { backgroundColor: colors.dangerBackground },
  feedbackText: { fontSize: 15, fontWeight: "600", color: colors.badgeTakenForeground },
  feedbackTextError: { color: colors.dangerForeground },

  privacyButton: { minHeight: 72, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: ui.radius.button, backgroundColor: colors.cardBackground },
  privacyButtonEnabled: { borderColor: colors.badgeTakenForeground, backgroundColor: colors.badgeTakenBackground },
  privacyTitle: { fontSize: 16, fontWeight: "700", color: colors.cardForeground },
  privacyDescription: { marginTop: 5, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  privacyMessage: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.textMuted },

  sectionTitle: { marginTop: 30, marginBottom: 12, fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  errorBox: { marginBottom: 16, padding: 14, borderRadius: ui.radius.button, backgroundColor: colors.dangerBackground },
  errorHint: { marginTop: 4, fontSize: 13, color: colors.textMuted },

  scheduleCard: { borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderStrong, borderRadius: ui.radius.card, padding: 16, marginBottom: 12, backgroundColor: colors.cardBackground },

  scheduleInformation: {
    gap: 4,
  },

  scheduleTime: { fontSize: 22, fontWeight: "700", color: colors.cardForeground },
  repeatText: { fontSize: 14, color: colors.textSecondary },

  statusDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },

  actionButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.outlineBorder, borderRadius: ui.radius.button, backgroundColor: colors.inputBackground },
  actionButtonText: { fontWeight: "700", color: colors.outlineForeground },
  deleteActionText: { fontWeight: "700", color: colors.dangerForeground },
});
