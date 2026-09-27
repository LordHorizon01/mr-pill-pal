/**
 * Caregiver access is intentionally authorization metadata only in Cycle 10.
 * Editing, medication reads, reports, notifications, and intake actions are
 * not enabled by these types.
 */
export {
  CAREGIVER_ACCESS_ROLE,
  CAREGIVER_INVITE_EXPIRY_DAYS,
  CaregiverAccess,
  CaregiverAccessError,
  CaregiverAccessErrorCode,
  CaregiverAccessRole,
  CaregiverAccessStatus,
} from "./caregiver-access.types";
