export type CaregiverPermission =
  | "view_medications"
  | "edit_medications"
  | "view_intake_history"
  | "view_reports"
  | "receive_missed_dose_alerts";

export interface CaregiverAccessGrant {
  id: string;
  profileId: string;
  caregiverAccountId: string;
  permissions: CaregiverPermission[];
  status: "pending" | "active" | "revoked";
  createdAt: string;
  updatedAt: string;
}
