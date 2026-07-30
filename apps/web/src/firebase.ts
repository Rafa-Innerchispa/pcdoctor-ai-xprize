import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

const runtimeApiUrl = (
  import.meta.env.VITE_API_URL || "http://localhost:8080"
).replace(/\/$/, "");

let authClient: Auth | null = null;
let authEnabled = false;
let initialization: Promise<{
  enabled: boolean;
  auth: Auth | null;
}> | null = null;

export function initializeFieldSparkAuth() {
  initialization ??= fetch(`${runtimeApiUrl}/v1/public/config`)
    .then(async (response) => {
      if (!response.ok) throw new Error("public_config_unavailable");
      return response.json() as Promise<{
        auth: {
          enabled: boolean;
          firebase: {
            apiKey: string;
            authDomain: string;
            projectId: string;
            appId: string;
          } | null;
        };
      }>;
    })
    .then(async (config) => {
      authEnabled = config.auth.enabled;
      if (!config.auth.enabled || !config.auth.firebase) {
        return { enabled: false, auth: null };
      }
      const app = initializeApp(config.auth.firebase);
      authClient = getAuth(app);
      authClient.useDeviceLanguage();
      await setPersistence(authClient, browserLocalPersistence);
      return { enabled: true, auth: authClient };
    });
  return initialization;
}

export async function signInWithGoogle() {
  const initialized = await initializeFieldSparkAuth();
  if (!initialized.auth) throw new Error("authentication_not_enabled");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(initialized.auth, provider);
}

export async function signOutFieldSpark() {
  if (authClient) await signOut(authClient);
}

export async function getCurrentIdToken() {
  if (!authEnabled) return null;
  return authClient?.currentUser?.getIdToken() ?? null;
}

export function observeAuth(
  auth: Auth,
  observer: (user: User | null) => void,
) {
  return onAuthStateChanged(auth, observer);
}

export type { User as FirebaseUser };

