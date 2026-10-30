
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { Timetable } from "../types";
import { getFirebaseServices } from "../firebase";

function getUserCollection(userId: string) {
  const { auth, db } = getFirebaseServices();
  const signedInUser = auth.currentUser;

  if (!signedInUser) {
    throw new Error("Sign in before accessing saved timetables.");
  }

  if (signedInUser.uid !== userId) {
    throw new Error("You cannot access another user's timetables.");
  }

  return collection(db, "users", signedInUser.uid, "timetables");
}

function validateTimetable(timetable: Timetable): void {
  if (!timetable.id || timetable.id === "draft") {
    throw new Error("A saved timetable must have a valid ID.");
  }

  if (!timetable.name.trim()) {
    throw new Error("Enter a name for your timetable.");
  }

  if (!Array.isArray(timetable.days) || timetable.days.length === 0) {
    throw new Error("Select at least one school day.");
  }

  if (
    !Number.isInteger(timetable.periodsPerDay) ||
    timetable.periodsPerDay < 1 ||
    timetable.periodsPerDay > 12
  ) {
    throw new Error("Periods per day must be between 1 and 12.");
  }

  if (!Array.isArray(timetable.lessons)) {
    throw new Error("The timetable lessons are invalid.");
  }
}

export async function saveTimetable(
  userId: string,
  timetable: Timetable,
): Promise<void> {
  validateTimetable(timetable);

  const collectionRef = getUserCollection(userId);
  const { db } = getFirebaseServices();

  await setDoc(
    doc(db, collectionRef.path, timetable.id),
    {
      ...timetable,
      name: timetable.name.trim(),
      updatedAt: Date.now(),
    },
  );
}

export async function deleteTimetable(
  userId: string,
  timetableId: string,
): Promise<void> {
  if (!timetableId || timetableId === "draft") {
    throw new Error("A valid saved timetable ID is required.");
  }

  const collectionRef = getUserCollection(userId);
  const { db } = getFirebaseServices();

  await deleteDoc(doc(db, collectionRef.path, timetableId));
}

export function subscribeToTimetables(
  userId: string,
  onChange: (timetables: Timetable[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const collectionRef = getUserCollection(userId);
  const orderedQuery = query(collectionRef, orderBy("updatedAt", "desc"));

  return onSnapshot(
    orderedQuery,
    (snapshot) => {
      const timetables = snapshot.docs.map(
        (document) => document.data() as Timetable,
      );

      onChange(timetables);
    },
    (error) => onError(error),
  );
}
