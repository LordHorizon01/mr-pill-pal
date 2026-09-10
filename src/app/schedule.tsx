import { useEffect, useRef, useState } from "react";
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
import type { ReminderStatus } from "@/features/schedules/schedule.types";

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

export default function ScheduleScreen() {
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

  async function handleCreateSchedule() {
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
        startDate: format(
          new Date(),
          "yyyy-MM-dd"
        ),
        repeatDays: selectedDays,
      });
    } catch {
      // Store already contains the error.
    } finally {
      releaseCreateScheduleLock();
    }
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
        Medication Schedule
      </Text>

      <Text style={styles.medicationName}>
        {medicationName ?? "Medication"}
      </Text>

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
          }}
          onPress={() =>
            setScheduleMode("one_time")
          }
          style={[
            styles.modeButton,
            scheduleMode === "one_time" &&
              styles.modeButtonSelected,
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
          }}
          onPress={() =>
            setScheduleMode("recurring")
          }
          style={[
            styles.modeButton,
            scheduleMode === "recurring" &&
              styles.modeButtonSelected,
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

      {/* One-time date */}

      {scheduleMode === "one_time" ? (
        <>
          <Text style={styles.label}>
            Reminder date
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
              minimumDate={new Date()}
              onValueChange={handleDateValueChange}
              onDismiss={() => setShowDatePicker(false)}
            />
          ) : null}
        </>
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          scheduleMode === "one_time"
            ? "Add one-time schedule"
            : "Add repeating schedule"
        }
        accessibilityState={{ disabled: isSaving, busy: isSaving }}
        disabled={isSaving}
        onPress={handleCreateSchedule}
        style={styles.primaryButton}
      >
        <Text
          style={styles.primaryButtonText}
        >
          {isSaving
            ? "Saving..."
            : scheduleMode === "one_time"
              ? "Add One-Time Schedule"
              : "Add Repeating Schedule"}
        </Text>
      </Pressable>

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
          <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>
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

              <Text accessibilityLiveRegion="polite">
                {statusInfo.label}
              </Text>

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
              {statusInfo.action ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${statusInfo.action} ${schedule.time} reminder`}
                  onPress={() => void handlePauseOrResumeSchedule(schedule)}
                  style={styles.actionButton}
                >
                  <Text>{statusInfo.action}</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${schedule.time} reminder`}
                onPress={() => handleDeleteSchedule(schedule)}
                style={styles.actionButton}
              >
                <Text>Delete</Text>
              </Pressable>
            </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
  },

  medicationName: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 18,
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

  modeButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#B8B8B8",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  modeButtonSelected: {
    backgroundColor: "#222222",
    borderColor: "#222222",
  },

  modeButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },

  modeButtonTextSelected: {
    color: "#FFFFFF",
  },

  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },

  dayButton: {
    minWidth: 44,
    minHeight: 48,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#B8B8B8",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  dayButtonSelected: {
    backgroundColor: "#222222",
    borderColor: "#222222",
  },

  dayButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },

  dayButtonTextSelected: {
    color: "#FFFFFF",
  },

  everyDayButton: {
    minHeight: 48,
    marginBottom: 12,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#222222",
    borderRadius: 10,
  },

  everyDayButtonSelected: {
    backgroundColor: "#222222",
  },

  everyDayButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },

  everyDayButtonTextSelected: {
    color: "#FFFFFF",
  },

  pickerButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#B8B8B8",
    borderRadius: 12,
    paddingHorizontal: 16,
  },

  pickerValue: {
    fontSize: 17,
    fontWeight: "600",
  },

  pickerHint: {
    fontSize: 14,
    color: "#4E5D6A",
  },

  primaryButton: {
    minHeight: 52,
    marginTop: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222222",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  testButton: {
    minHeight: 52,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#222222",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  testButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },

  feedbackBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#EAF7EF",
  },

  feedbackBoxError: {
    backgroundColor: "#FDECEC",
  },

  feedbackText: {
    fontSize: 15,
    fontWeight: "600",
  },

  privacyButton: {
    minHeight: 72,
    padding: 14,
    borderWidth: 1,
    borderColor: "#B8B8B8",
    borderRadius: 12,
  },

  privacyButtonEnabled: {
    borderColor: "#176B3A",
    backgroundColor: "#EAF7EF",
  },

  privacyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },

  privacyDescription: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
  },

  privacyMessage: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },

  sectionTitle: {
    marginTop: 30,
    marginBottom: 12,
    fontSize: 20,
    fontWeight: "700",
  },

  emptyText: {
    fontSize: 15,
  },

  errorBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#FDECEC",
  },

  errorHint: {
    marginTop: 4,
    fontSize: 13,
  },

  scheduleCard: {
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },

  scheduleInformation: {
    gap: 4,
  },

  scheduleTime: {
    fontSize: 22,
    fontWeight: "700",
  },

  repeatText: {
    fontSize: 14,
  },

  statusDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4E5D6A",
  },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },

  actionButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
});
