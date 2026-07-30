import type { FieldSparkSession } from "@fieldspark/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadSession, updateProfile } from "./api";
import {
  initializeFieldSparkAuth,
  observeAuth,
  signInWithGoogle,
  signOutFieldSpark,
  type FirebaseUser,
} from "./firebase";

interface AuthContextValue {
  loading: boolean;
  authEnabled: boolean;
  firebaseUser: FirebaseUser | null;
  session: FieldSparkSession | null;
  error: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (profile: {
    displayName: string;
    phone: string;
    taxId: string;
    personType: "natural" | "company";
    legalName: string;
  }) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [session, setSession] = useState<FieldSparkSession | null>(null);
  const [error, setError] = useState("");

  const refreshSession = useCallback(async () => {
    const next = await loadSession();
    setSession(next);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;
    initializeFieldSparkAuth()
      .then(async (initialized) => {
        if (!mounted) return;
        setAuthEnabled(initialized.enabled);
        if (!initialized.auth) {
          await refreshSession();
          if (mounted) setLoading(false);
          return;
        }
        unsubscribe = observeAuth(initialized.auth, async (user) => {
          if (!mounted) return;
          setFirebaseUser(user);
          setError("");
          if (!user) {
            setSession(null);
            setLoading(false);
            return;
          }
          setLoading(true);
          try {
            await refreshSession();
          } catch {
            if (mounted) setError("No pudimos abrir tu espacio de trabajo.");
          } finally {
            if (mounted) setLoading(false);
          }
        });
      })
      .catch(() => {
        if (mounted) {
          setError("El servicio de identidad no está disponible.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      authEnabled,
      firebaseUser,
      session,
      error,
      signIn: async () => {
        setLoading(true);
        setError("");
        try {
          await signInWithGoogle();
        } catch {
          setError("No se completó el acceso con Google.");
          setLoading(false);
        }
      },
      signOut: async () => {
        await signOutFieldSpark();
        setSession(null);
      },
      saveProfile: async (profile) => {
        setLoading(true);
        setError("");
        try {
          setSession(await updateProfile(profile));
        } finally {
          setLoading(false);
        }
      },
      refreshSession,
    }),
    [
      authEnabled,
      error,
      firebaseUser,
      loading,
      refreshSession,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useFieldSparkAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is missing");
  return context;
}

