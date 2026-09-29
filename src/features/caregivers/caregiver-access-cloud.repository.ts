import * as firestore from "@react-native-firebase/firestore";
import { getCurrentAuthenticatedUser } from "@/features/auth/auth.service";
import { CaregiverAccess } from "./caregiver-access.types";

type FirestoreTimestamp = { toDate?: () => Date };
type FirestoreCaregiverAccess = Omit<CaregiverAccess, "id" | "createdAt" | "expiresAt" | "acceptedAt" | "revokedAt" | "updatedAt"> & {
  createdAt?: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp;
  acceptedAt?: FirestoreTimestamp | null;
  revokedAt?: FirestoreTimestamp | null;
  updatedAt?: FirestoreTimestamp;
};

const firebaseStore = () => firestore.getFirestore();

function toIso(value: FirestoreTimestamp | Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  throw new Error("Invalid caregiver access timestamp.");
}

function mapCaregiverAccess(id: string, data: FirestoreCaregiverAccess): CaregiverAccess {
  const createdAt = toIso(data.createdAt);
  const expiresAt = toIso(data.expiresAt);
  const updatedAt = toIso(data.updatedAt);
  if (!createdAt || !expiresAt || !updatedAt) throw new Error("Invalid caregiver access record.");
  return {
    id,
    ownerUid: data.ownerUid,
    profileId: data.profileId,
    caregiverUid: data.caregiverUid ?? null,
    role: data.role,
    status: data.status,
    createdAt,
    expiresAt,
    acceptedAt: toIso(data.acceptedAt),
    revokedAt: toIso(data.revokedAt),
    updatedAt,
  };
}

function accessReference(accessId: string) {
  return firestore.doc(firebaseStore(), "profileAccess", accessId);
}

function assertAuthenticatedActor(actorUid: string): void {
  getCurrentAuthenticatedUser(actorUid);
}

export async function createPendingCaregiverAccessRecord(input: {
  ownerUid: string;
  profileId: string;
  expiresAt: Date;
}): Promise<string> {
  assertAuthenticatedActor(input.ownerUid);
  const reference = firestore.doc(firestore.collection(firebaseStore(), "profileAccess"));
  await firestore.setDoc(reference, {
    ownerUid: input.ownerUid,
    profileId: input.profileId,
    caregiverUid: null,
    role: "READ_ONLY_CAREGIVER",
    status: "PENDING",
    createdAt: firestore.serverTimestamp(),
    expiresAt: input.expiresAt,
    acceptedAt: null,
    revokedAt: null,
    updatedAt: firestore.serverTimestamp(),
  });
  return reference.id;
}

/** Exact-ID lookup only. There is intentionally no pending-invitation list query. */
export async function getCaregiverAccessByExactId(actorUid: string, accessId: string): Promise<CaregiverAccess | null> {
  assertAuthenticatedActor(actorUid);
  const snapshot = await firestore.getDoc(accessReference(accessId));
  return snapshot.exists() ? mapCaregiverAccess(snapshot.id, snapshot.data() as FirestoreCaregiverAccess) : null;
}

export async function acceptPendingCaregiverAccessRecord(actorUid: string, accessId: string): Promise<void> {
  assertAuthenticatedActor(actorUid);
  const reference = accessReference(accessId);
  await firestore.runTransaction(firebaseStore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("Caregiver access record was not found.");
    transaction.update(reference, {
      caregiverUid: actorUid,
      status: "ACTIVE",
      acceptedAt: firestore.serverTimestamp(),
      updatedAt: firestore.serverTimestamp(),
    });
  });
}

export async function revokeCaregiverAccessRecord(actorUid: string, accessId: string): Promise<void> {
  assertAuthenticatedActor(actorUid);
  const reference = accessReference(accessId);
  await firestore.runTransaction(firebaseStore(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("Caregiver access record was not found.");
    transaction.update(reference, {
      status: "REVOKED",
      revokedAt: firestore.serverTimestamp(),
      updatedAt: firestore.serverTimestamp(),
    });
  });
}

export async function listCaregiverAccessOwnedBy(actorUid: string): Promise<CaregiverAccess[]> {
  assertAuthenticatedActor(actorUid);
  const collection = firestore.collection(firebaseStore(), "profileAccess");
  const snapshot = await firestore.getDocs(firestore.query(collection, firestore.where("ownerUid", "==", actorUid)));
  return snapshot.docs.map((document) => mapCaregiverAccess(document.id, document.data() as FirestoreCaregiverAccess));
}

export async function listActiveCaregiverAccessFor(actorUid: string): Promise<CaregiverAccess[]> {
  assertAuthenticatedActor(actorUid);
  const collection = firestore.collection(firebaseStore(), "profileAccess");
  const snapshot = await firestore.getDocs(firestore.query(
    collection,
    firestore.where("caregiverUid", "==", actorUid),
    firestore.where("status", "==", "ACTIVE"),
  ));
  return snapshot.docs.map((document) => mapCaregiverAccess(document.id, document.data() as FirestoreCaregiverAccess));
}
