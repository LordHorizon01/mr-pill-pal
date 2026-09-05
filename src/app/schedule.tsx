import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

import { useSchedules } from "@/hooks/useSchedules";

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

  const [time, setTime] = useState("09:00");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (medicationId) {
      loadSchedules(medicationId);
    }
  }, [medicationId, loadSchedules]);

  async function handleCreateSchedule() {
    if (!medicationId) {
      return;
    }

    try {
      setIsSaving(true);

      const today = new Date()
        .toISOString()
        .slice(0, 10);

      await createSchedule({
        medicationId,
        type: "recurring",
        time,
        startDate: today,

        // Temporary test:
        // repeat every day.
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
      });
    } catch {
      // Store already contains the error.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
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
        >
          <Text>{error}</Text>
          <Text style={styles.errorHint}>
            Tap to dismiss
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>
        Reminder time
      </Text>

      <TextInput
        accessibilityLabel="Reminder time"
        value={time}
        onChangeText={setTime}
        placeholder="09:00"
        style={styles.input}
      />

      <Pressable
        accessibilityRole="button"
        disabled={isSaving}
        onPress={handleCreateSchedule}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving
            ? "Saving..."
            : "Add Daily Schedule"}
        </Text>
      </Pressable>

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
        schedules.map((schedule) => (
          <View
            key={schedule.id}
            style={styles.scheduleCard}
          >
            <View style={styles.scheduleInformation}>
              <Text style={styles.scheduleTime}>
                {schedule.time}
              </Text>

              <Text>
                {schedule.isActive
                  ? "Active"
                  : "Paused"}
              </Text>

              <Text style={styles.repeatText}>
                Every day
              </Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  schedule.isActive
                    ? pauseSchedule(schedule.id)
                    : resumeSchedule(schedule.id)
                }
                style={styles.actionButton}
              >
                <Text>
                  {schedule.isActive
                    ? "Pause"
                    : "Resume"}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  deleteSchedule(schedule.id)
                }
                style={styles.actionButton}
              >
                <Text>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 24,
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
    marginBottom: 8,
    fontSize: 15,
    fontWeight: "600",
  },

  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#B8B8B8",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
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

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },

  actionButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
});