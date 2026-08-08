import { useEffect, useMemo, useState, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  department_id: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadIdentity(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [profileResult, rolesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, middle_name, last_name, email, phone, photo_url, department_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((profileResult.data as Profile | null) ?? null);
    setRoles(((rolesResult.data ?? []) as { role: AppRole }[]).map((row) => row.role));
  }

  useEffect(() => {
    let active = true;

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      void loadIdentity(nextSession?.user?.id).finally(() => setLoading(false));
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadIdentity(data.session?.user?.id).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
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
      isStaff: ["super_admin", "principal", "hod", "teacher"].some((role) =>
        roles.includes(role as AppRole),
      ),
      refresh: async () => {
        await loadIdentity(session?.user?.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
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
