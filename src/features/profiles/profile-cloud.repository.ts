import * as firestore from "@react-native-firebase/firestore";
import {
  ensureAccountDocument,
  getCurrentAuthenticatedUser,
  markAccountProfileSetupComplete,
} from "@/features/auth/auth.service";
import { buildProfileDocumentDraft, ProfileSetupError } from "./profile-setup.domain";
import { CreateProfileInput, Profile, UpdateProfileInput } from "./profile.types";

type FirestoreProfile = Omit<Profile, "id" | "accountUid" | "createdAt" | "updatedAt" | "accessLevel"> & {
  ownerUid: string;
  createdAt?: { toDate: () => Date };
  updatedAt?: { toDate: () => Date };
};

const firebaseStore = () => firestore.getFirestore();

function mapRemote(id: string, data: FirestoreProfile): Profile {
  const { ownerUid, ...profileData } = data;
  return {
    ...profileData,
    id,
    accountUid: ownerUid,
    accessLevel: "OWNER",
    createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

function profileReference(profileId: string) {
  return firestore.doc(firebaseStore(), "profiles", profileId);
}

/** Reuses a caller-provided ID so a retry cannot create a second cloud profile. */
export async function createRemoteProfile(
  accountUid: string,
  input: CreateProfileInput,
  profileId: string,
): Promise<Profile> {
  let user;
  try {
    user = getCurrentAuthenticatedUser(accountUid);
  } catch (error) {
    throw new ProfileSetupError("obtain-authenticated-user", error);
  }

  try {
    await ensureAccountDocument(user);
  } catch (error) {
    throw new ProfileSetupError("ensure-account-document", error);
  }

  const reference = profileReference(profileId);
  const now = new Date().toISOString();
  const profile: Profile = {
    id: profileId,
    accountUid,
    fullName: input.fullName,
    ...(input.nickname ? { nickname: input.nickname } : {}),
    dateOfBirth: input.dateOfBirth,
    relationship: input.relationship,
    ...(input.medicalDetails ? { medicalDetails: input.medicalDetails } : {}),
    role: input.relationship === "Self" ? "SELF" : "DEPENDENT",
    accessLevel: "OWNER",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    // Do not read this reference before the write. A profile's read rule relies
    // on resource.data.ownerUid, which does not exist until this first write.
    // setDoc is idempotent for the stable first-profile ID: rules evaluate a
    // create for a new document and an owner-preserving update on a retry.
    await firestore.setDoc(reference, {
      ...buildProfileDocumentDraft(accountUid, input),
      createdAt: firestore.serverTimestamp(),
      updatedAt: firestore.serverTimestamp(),
    });
  } catch (error) {
    throw new ProfileSetupError("create-profile-document", error);
  }

  return profile;
}

export async function markRemoteProfileSetupComplete(accountUid: string): Promise<void> {
  try {
    await markAccountProfileSetupComplete(accountUid);
  } catch (error) {
    throw new ProfileSetupError("mark-profile-setup-complete", error);
  }
}

export async function listRemoteProfiles(accountUid: string): Promise<Profile[]> {
  const profiles = firestore.collection(firebaseStore(), "profiles");
  const snapshot = await firestore.getDocs(firestore.query(profiles, firestore.where("ownerUid", "==", accountUid)));
  return snapshot.docs.map((document) => mapRemote(document.id, document.data() as FirestoreProfile)).filter((profile) => !profile.deletedAt);
}

export async function updateRemoteProfile(accountUid: string, profileId: string, input: UpdateProfileInput): Promise<void> {
  const reference = profileReference(profileId);
  const snapshot = await firestore.getDoc(reference);
  if (!snapshot.exists() || snapshot.data()?.ownerUid !== accountUid) throw new Error("This profile is not available for this account.");
  await firestore.updateDoc(reference, { fullName: input.fullName, nickname: input.nickname ?? null, dateOfBirth: input.dateOfBirth, relationship: input.relationship, medicalDetails: input.medicalDetails ?? null, isActive: input.isActive ?? true, updatedAt: firestore.serverTimestamp() });
}

export async function deactivateRemoteProfile(accountUid: string, profileId: string): Promise<void> {
  const reference = profileReference(profileId); const snapshot = await firestore.getDoc(reference);
  if (!snapshot.exists() || snapshot.data()?.ownerUid !== accountUid) throw new Error("This profile is not available for this account.");
  await firestore.updateDoc(reference, { isActive: false, updatedAt: firestore.serverTimestamp() });
}
