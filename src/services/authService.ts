
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Unsubscribe,
  type User,
} from "firebase/auth";
import {
  ensureAuthPersistence,
  getFirebaseServices,
} from "../firebase";

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  await ensureAuthPersistence();

  const { auth } = getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  const name = displayName?.trim();

  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }

  return credential.user;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  await ensureAuthPersistence();

  const { auth } = getFirebaseServices();
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  return credential.user;
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebaseServices();
  await sendPasswordResetEmail(auth, email.trim());
}

export function watchAuthState(
  callback: (user: User | null) => void,
): Unsubscribe {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return getFirebaseServices().auth.currentUser;
}
