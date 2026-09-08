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

function parseReminderTime(
  time: string
): {
  hour: number;
  minute: number;
} {
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

  return {
    hour,
    minute,
  };
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

  const { hour, minute } = parseReminderTime(time);

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

export async function scheduleOneTimeMedicationReminder(
  medicationName: string,
  date: string,
  time: string
): Promise<string> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new Error(
      "Notification permission was not granted."
    );
  }

  const { hour, minute } = parseReminderTime(time);

  const dateParts = date.split("-").map(Number);

  if (
    dateParts.length !== 3 ||
    dateParts.some(Number.isNaN)
  ) {
    throw new Error("Invalid reminder date.");
  }

  const [year, month, day] = dateParts;

  const reminderDate = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );

  if (
    reminderDate.getFullYear() !== year ||
    reminderDate.getMonth() !== month - 1 ||
    reminderDate.getDate() !== day
  ) {
    throw new Error("Invalid reminder date.");
  }

  if (reminderDate.getTime() <= Date.now()) {
    throw new Error(
      "Reminder date and time must be in the future."
    );
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Medication Reminder",
      body: `Time to take ${medicationName}`,
    },

    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
      channelId: MEDICATION_CHANNEL_ID,
    },
  });
}

export async function scheduleWeeklyMedicationReminders(
  medicationName: string,
  time: string,
  repeatDays: number[]
): Promise<string[]> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new Error(
      "Notification permission was not granted."
    );
  }

  const { hour, minute } = parseReminderTime(time);

  const uniqueDays = [...new Set(repeatDays)].sort(
    (a, b) => a - b
  );

  if (uniqueDays.length === 0) {
    throw new Error(
      "At least one repeat day is required."
    );
  }

  const hasInvalidDay = uniqueDays.some(
    (day) =>
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6
  );

  if (hasInvalidDay) {
    throw new Error(
      "Repeat days must contain values from 0 to 6."
    );
  }

  const notificationIds: string[] = [];

  try {
    for (const day of uniqueDays) {
      /*
       * Mr. Pill Pal:
       * 0 = Sunday ... 6 = Saturday
       *
       * Expo WEEKLY:
       * 1 = Sunday ... 7 = Saturday
       */
      const expoWeekday = day + 1;

      const notificationId =
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Medication Reminder",
            body: `Time to take ${medicationName}`,
          },

          trigger: {
            type:
              Notifications
                .SchedulableTriggerInputTypes.WEEKLY,
            weekday: expoWeekday,
            hour,
            minute,
            channelId: MEDICATION_CHANNEL_ID,
          },
        });

      notificationIds.push(notificationId);
    }

    return notificationIds;
  } catch (error) {
    // Prevent partially-created/orphan reminders.
    await Promise.all(
      notificationIds.map((notificationId) =>
        Notifications.cancelScheduledNotificationAsync(
          notificationId
        )
      )
    );

    throw error;
  }
}

export async function cancelScheduledNotification(
  notificationId: string
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    notificationId
  );
}

export async function cancelScheduledNotifications(
  notificationIds: string[]
): Promise<void> {
  await Promise.all(
    notificationIds.map((notificationId) =>
      Notifications.cancelScheduledNotificationAsync(
        notificationId
      )
    )
  );
}