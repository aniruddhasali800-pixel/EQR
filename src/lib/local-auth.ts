/**
 * Local Authentication Engine
 * Replaces Supabase auth entirely. All accounts and sessions stored in localStorage.
 * Supports persistent auto-login: user logs in once, stays logged in across browser restarts.
 */

import type { AppRole } from "./auth";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LocalUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: AppRole;
  password_hash: string;
  created_at: string;
};

export type LocalSession = {
  user_id: string;
  token: string;
  created_at: string;
};

// ─── Storage Keys ────────────────────────────────────────────────────────────

const KEYS = {
  USERS: "cerp_auth_users",
  SESSION: "cerp_auth_session",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("[local-auth] Storage write failed:", err);
  }
}

/** Simple SHA-256 hash using Web Crypto API (available in all modern browsers). */
async function hashPassword(password: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    // SSR fallback: simple hash (not secure, but we only run auth on client)
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `simple_${Math.abs(hash).toString(36)}`;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateToken(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const localAuth = {
  /** Get all registered users. */
  getUsers(): LocalUser[] {
    return getStored<LocalUser[]>(KEYS.USERS, []);
  },

  /** Get the current active session, or null if not logged in. */
  getSession(): { user: LocalUser; session: LocalSession } | null {
    const session = getStored<LocalSession | null>(KEYS.SESSION, null);
    if (!session) return null;

    const users = this.getUsers();
    const user = users.find((u) => u.id === session.user_id);
    if (!user) {
      // Session points to a deleted user — clear it
      this.signOut();
      return null;
    }

    return { user, session };
  },

  /** Create a new account. Returns the user + session on success. */
  async signUp(
    firstName: string,
    lastName: string,
    email: string,
    phone: string | null,
    password: string,
    role: AppRole,
  ): Promise<{ user: LocalUser; session: LocalSession } | { error: string }> {
    const users = this.getUsers();
    const normalizedEmail = email.trim().toLowerCase();

    // Check for duplicate email
    if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      return { error: "An account with this email already exists. Please sign in instead." };
    }

    const passwordHash = await hashPassword(password);
    const newUser: LocalUser = {
      id: generateId(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || null,
      role,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };

    users.push(newUser);
    setStored(KEYS.USERS, users);

    // Auto-login after signup
    const session: LocalSession = {
      user_id: newUser.id,
      token: generateToken(),
      created_at: new Date().toISOString(),
    };
    setStored(KEYS.SESSION, session);

    return { user: newUser, session };
  },

  /** Sign in with email + password. Returns user + session on success. */
  async signIn(
    email: string,
    password: string,
  ): Promise<{ user: LocalUser; session: LocalSession } | { error: string }> {
    const users = this.getUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      return { error: "No account found with this email. Please create an account first." };
    }

    const passwordHash = await hashPassword(password);
    if (user.password_hash !== passwordHash) {
      return { error: "Incorrect password. Please try again." };
    }

    const session: LocalSession = {
      user_id: user.id,
      token: generateToken(),
      created_at: new Date().toISOString(),
    };
    setStored(KEYS.SESSION, session);

    return { user, session };
  },

  /** Quick demo login — creates a demo user if needed and logs in instantly. */
  loginAsDemo(role: AppRole): { user: LocalUser; session: LocalSession } {
    const demoEmails: Record<string, { first: string; last: string; email: string }> = {
      teacher: { first: "Demo", last: "Teacher", email: "teacher@campus.demo" },
      hod: { first: "Demo", last: "HOD", email: "hod@campus.demo" },
      cr: { first: "Demo", last: "CR", email: "cr@campus.demo" },
      student: { first: "Demo", last: "Student", email: "student@campus.demo" },
      super_admin: { first: "Demo", last: "Admin", email: "admin@campus.demo" },
    };

    const info = demoEmails[role] ?? demoEmails.student!;
    const users = this.getUsers();
    let user = users.find((u) => u.email === info.email);

    if (!user) {
      user = {
        id: `demo-${role}`,
        first_name: info.first,
        last_name: info.last,
        email: info.email,
        phone: null,
        role,
        password_hash: "demo_no_password",
        created_at: new Date().toISOString(),
      };
      users.push(user);
      setStored(KEYS.USERS, users);
    }

    const session: LocalSession = {
      user_id: user.id,
      token: generateToken(),
      created_at: new Date().toISOString(),
    };
    setStored(KEYS.SESSION, session);

    return { user, session };
  },

  /** Sign out — clears the session token. */
  signOut(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(KEYS.SESSION);
    }
  },

  /** Admin: update any user's role. */
  updateUserRole(userId: string, newRole: AppRole): boolean {
    const users = this.getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return false;
    user.role = newRole;
    setStored(KEYS.USERS, users);
    return true;
  },

  /** Admin: delete a user account. */
  deleteUser(userId: string): boolean {
    const users = this.getUsers().filter((u) => u.id !== userId);
    setStored(KEYS.USERS, users);

    // If the deleted user was logged in, sign them out
    const session = getStored<LocalSession | null>(KEYS.SESSION, null);
    if (session?.user_id === userId) {
      this.signOut();
    }
    return true;
  },
};
