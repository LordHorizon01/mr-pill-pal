import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { useMedications } from "@/hooks/useMedications";

export default function MedicationsScreen() {
  const {
    medications,
    isLoading,
    error,
    loadMedications,
    createMedication,
    deleteMedication,
    clearError,
  } = useMedications();

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadMedications();
  }, [loadMedications]);

  async function handleAddMedication() {
    try {
      setIsSaving(true);

      await createMedication({
        name,
        dosage,
      });

      setName("");
      setDosage("");
    } catch {
      // Error is already stored by the medication store.
    } finally {
      setIsSaving(false);
    }
  }

  function handleDeleteMedication(id: string, medicationName: string) {
    Alert.alert(
      "Delete medication?",
      `Are you sure you want to delete ${medicationName}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMedication(id);
            } catch {
              // Error is already stored by the medication store.
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Medications</Text>

      <Text style={styles.subtitle}>
        Add and manage your medications.
      </Text>

      {error ? (
        <Pressable style={styles.errorBox} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>Tap to dismiss</Text>
        </Pressable>
      ) : null}

      <View style={styles.form}>
        <TextInput
          accessibilityLabel="Medication name"
          placeholder="Medication name"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />

        <TextInput
          accessibilityLabel="Dosage"
          placeholder="Dosage, for example 500 mg"
          value={dosage}
          onChangeText={setDosage}
          style={styles.input}
        />

        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={handleAddMedication}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.buttonPressed,
            isSaving && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.addButtonText}>
            {isSaving ? "Saving..." : "Add Medication"}
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" />
      ) : medications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No medications yet</Text>

          <Text style={styles.emptyText}>
            Add your first medication above.
          </Text>
        </View>
      ) : (
        <FlatList
          data={medications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.medicationCard}>
              <View style={styles.medicationInformation}>
                <Text style={styles.medicationName}>{item.name}</Text>

                <Text style={styles.medicationDosage}>
                  {item.dosage}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name}`}
                onPress={() =>
                  handleDeleteMedication(item.id, item.name)
                }
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: "#FFFFFF",
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
  },

  subtitle: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 16,
  },

  form: {
    gap: 12,
    marginBottom: 24,
  },

  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#B8B8B8",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },

  addButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222222",
  },

  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  errorBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#FDECEC",
  },

  errorText: {
    fontSize: 15,
    fontWeight: "600",
  },

  errorHint: {
    marginTop: 4,
    fontSize: 13,
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },

  emptyText: {
    marginTop: 6,
    fontSize: 15,
  },

  list: {
    paddingBottom: 40,
  },

  medicationCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#DDDDDD",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },

  medicationInformation: {
    flex: 1,
    marginRight: 12,
  },

  medicationName: {
    fontSize: 18,
    fontWeight: "600",
  },

  medicationDosage: {
    marginTop: 4,
    fontSize: 15,
  },

  deleteButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  deleteButtonText: {
    fontWeight: "600",
  },
});