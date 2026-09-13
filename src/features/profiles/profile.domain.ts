import {
  CreateProfileInput,
  MedicalProfileDetails,
  Profile,
  ProfileRelationship,
} from "./profile.types";

const RELATIONSHIPS: readonly ProfileRelationship[] = [
  "Self", "Mother", "Father", "Child", "Spouse", "Family member", "Other",
];

export function normalizeProfileInput(input: CreateProfileInput): CreateProfileInput {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const nickname = input.nickname?.trim().replace(/\s+/g, " ") || undefined;
  const dateOfBirth = input.dateOfBirth.trim();

  if (!fullName || fullName.length > 100) {
    throw new Error("Enter a full name of 100 characters or fewer.");
  }
  if (nickname && nickname.length > 60) {
    throw new Error("Nickname must be 60 characters or fewer.");
  }
  if (!RELATIONSHIPS.includes(input.relationship)) {
    throw new Error("Choose a valid relationship.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error("Enter the date of birth as a valid date.");
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!parts) {
    throw new Error("Enter the date of birth as a valid date.");
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const parsed = new Date(year, month - 1, day, 12);
  const today = new Date();
  const isValidCalendarDate = parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  const localTodayAtNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const isFutureLocalDate = parsed > localTodayAtNoon;
  if (!isValidCalendarDate) {
    throw new Error("Enter the date of birth as a valid date.");
  }
  if (isFutureLocalDate) {
    throw new Error("Date of birth cannot be in the future.");
  }
  if (parsed.getFullYear() < 1900) {
    throw new Error("Enter a plausible date of birth.");
  }

  return {
    ...input,
    fullName,
    nickname,
    dateOfBirth,
    medicalDetails: normalizeMedicalDetails(input.medicalDetails),
  };
}

function normalizeMedicalDetails(details?: MedicalProfileDetails): MedicalProfileDetails | undefined {
  if (!details) return undefined;
  const clean = (value?: string) => value?.trim() || undefined;
  const result = {
    allergies: clean(details.allergies),
    conditions: clean(details.conditions),
    generalNotes: clean(details.generalNotes),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

export function getProfileDisplayName(profile: Pick<Profile, "fullName" | "nickname">): string {
  const nickname = profile.nickname?.trim();
  return nickname && nickname.localeCompare(profile.fullName, undefined, { sensitivity: "accent" }) !== 0
    ? `${nickname} (${profile.fullName})`
    : profile.fullName;
}

export function getGreeting(profile: Pick<Profile, "fullName" | "nickname">, now = new Date()): string {
  const hour = now.getHours();
  const period = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";
  return `${period}, ${getProfileDisplayName(profile)}`;
}

export function getProfileGreetingName(profile?: Pick<Profile, "fullName" | "nickname"> | null): string | null {
  if (!profile) return null;
  const nickname = profile.nickname?.trim().replace(/\s+/g, " ");
  if (nickname) return nickname;
  const fullName = profile.fullName?.trim().replace(/\s+/g, " ");
  return fullName?.split(" ")[0] || null;
}

export function getHomeGreeting(profile?: Pick<Profile, "fullName" | "nickname"> | null, now = new Date()): string {
  const hour = now.getHours();
  const period = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
  const name = getProfileGreetingName(profile);
  return name ? `${period}, ${name}` : period;
}
