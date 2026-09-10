import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const MEDICATION_CHANNEL_ID = "medication-reminders-v3";
const PRIVATE_REMINDER_BODY = "It is time for a medication reminder.";

export class NotificationPermissionError extends Error {
  constructor() {
    super("Notifications are disabled. Enable notifications, then try again.");
    this.name = "NotificationPermissionError";
  }
}

export class ReminderTimeExpiredError extends Error {
  constructor() {
    super("This reminder time has already passed.");
    this.name = "ReminderTimeExpiredError";
  }
}

export class NativeReminderSchedulingError extends Error {
  constructor() {
    super("Reminder could not be scheduled. Try again.");
    this.name = "NativeReminderSchedulingError";
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureMedicationNotificationChannel(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
      name: "Medication Reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  await ensureMedicationNotificationChannel();

  const permission = await Notifications.getPermissionsAsync();

  return permission.status === "granted";
}

export async function initializeNotifications(): Promise<boolean> {
  await ensureMedicationNotificationChannel();

  const existingPermission = await Notifications.getPermissionsAsync();

  if (existingPermission.status === "granted") {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync();

  return requestedPermission.status === "granted";
}

export async function getScheduledNotificationIds(): Promise<string[]> {
  const scheduledNotifications =
    await Notifications.getAllScheduledNotificationsAsync();

  return scheduledNotifications.map((notification) => notification.identifier);
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

function getMedicationReminderBody(
  medicationName: string,
  hideMedicationName: boolean,
): string {
  return hideMedicationName
    ? PRIVATE_REMINDER_BODY
    : `Time to take ${medicationName}`;
}

export async function scheduleTestNotification(): Promise<string> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new NotificationPermissionError();
  }

  try {
    return await Notifications.scheduleNotificationAsync({
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
  } catch {
    throw new NativeReminderSchedulingError();
  }
}

export async function scheduleDailyMedicationReminder(
  medicationName: string,
  time: string,
  hideMedicationName = false
): Promise<string> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new NotificationPermissionError();
  }

  const { hour, minute } = parseReminderTime(time);

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Medication Reminder",
        body: getMedicationReminderBody(medicationName, hideMedicationName),
      },

      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: MEDICATION_CHANNEL_ID,
      },
    });
  } catch {
    throw new NativeReminderSchedulingError();
  }
}

export async function scheduleOneTimeMedicationReminder(
  medicationName: string,
  date: string,
  time: string,
  hideMedicationName = false
): Promise<string> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new NotificationPermissionError();
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
    throw new ReminderTimeExpiredError();
  }

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Medication Reminder",
        body: getMedicationReminderBody(medicationName, hideMedicationName),
      },

      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
        channelId: MEDICATION_CHANNEL_ID,
      },
    });
  } catch {
    throw new NativeReminderSchedulingError();
  }
}

export async function scheduleWeeklyMedicationReminders(
  medicationName: string,
  time: string,
  repeatDays: number[],
  hideMedicationName = false
): Promise<string[]> {
  const hasPermission = await initializeNotifications();

  if (!hasPermission) {
    throw new NotificationPermissionError();
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
            body: getMedicationReminderBody(
              medicationName,
              hideMedicationName
            ),
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

    throw new NativeReminderSchedulingError();
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
