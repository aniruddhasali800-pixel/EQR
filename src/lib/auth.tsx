import { useEffect, useMemo, useState, createContext, useContext, type ReactNode } from "react";
import { localAuth, type LocalUser } from "./local-auth";

export type AppRole = "super_admin" | "principal" | "hod" | "teacher" | "cr" | "student";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  principal: "Principal",
  hod: "HOD",
  teacher: "Teacher",
  cr: "Class Representative",
  student: "Student",
};

export type Profile = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  address?: string | null;
  department_id: string | null;
};

/** Lightweight session shape that mirrors the old Supabase session for compatibility. */
type LocalSessionCompat = {
  user: { id: string; email?: string };
  access_token: string;
};

type AuthContextValue = {
  session: LocalSessionCompat | null;
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  isStaff: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function userToProfile(u: LocalUser): Profile {
  return {
    id: u.id,
    first_name: u.first_name,
    middle_name: null,
    last_name: u.last_name,
    email: u.email,
    phone: u.phone,
    photo_url: u.photo_url ?? null,
    address: u.address ?? null,
    department_id: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalSessionCompat | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  function loadFromLocalAuth() {
    const result = localAuth.getSession();
    if (result) {
      setSession({
        user: { id: result.user.id, email: result.user.email },
        access_token: result.session.token,
      });
      setProfile(userToProfile(result.user));
      setRoles([result.user.role]);
    } else {
      setSession(null);
      setProfile(null);
      setRoles([]);
    }
    setLoading(false);
  }

  // On mount, check localStorage for existing session → auto-login
  useEffect(() => {
    loadFromLocalAuth();

    // Listen for storage events from other tabs
    function onStorage(e: StorageEvent) {
      if (e.key === "cerp_auth_session") {
        loadFromLocalAuth();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const hasRole = (role: AppRole) => roles.includes(role);
    return {
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      hasRole,
      hasAnyRole: (list: AppRole[]) => list.some((role) => roles.includes(role)),
      isStaff: ["super_admin", "principal", "hod", "teacher", "cr"].some((role) =>
        roles.includes(role as AppRole),
      ),
      refresh: async () => {
        loadFromLocalAuth();
      },
      signOut: async () => {
        localAuth.signOut();
        setSession(null);
        setProfile(null);
        setRoles([]);
      },
    };
  }, [session, profile, roles, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function displayName(profile: Profile | null, fallback = "User") {
  if (!profile) return fallback;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return name || profile.email || fallback;
}
