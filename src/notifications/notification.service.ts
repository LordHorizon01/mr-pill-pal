import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const MEDICATION_CHANNEL_ID = "medication-reminders-v3";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function initializeNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
      name: "Medication Reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();

  if (existingPermission.status === "granted") {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync();

  return requestedPermission.status === "granted";
}


export async function scheduleTestNotification(): Promise<string> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new Error("Notification permission was not granted.");
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Mr. Pill Pal",
      body: "Test medication reminder",
    },

    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: MEDICATION_CHANNEL_ID,
    },
  });
}

export async function scheduleDailyMedicationReminder(
  medicationName: string,
  time: string
): Promise<string> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new Error("Notification permission was not granted.");
  }

  const [hourString, minuteString] = time.split(":");

  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Invalid reminder time.");
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Medication Reminder",
      body: `Time to take ${medicationName}`,
    },

    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: MEDICATION_CHANNEL_ID,
    },
  });
}

export async function cancelScheduledNotification(
  notificationId: string
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    notificationId
  );
}