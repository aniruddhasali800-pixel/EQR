/**
 * Local Storage Offline Data Engine
 * Provides a zero-dependency, self-contained browser storage layer for Campus ERP.
 * Operates automatically when Supabase is not connected or offline.
 */

export type LocalProfile = {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  phone?: string | null;
  department_id?: string | null;
  role: "super_admin" | "principal" | "hod" | "teacher" | "cr" | "student";
};

export type LocalStudentDetail = {
  user_id: string;
  roll_number: string;
  prn?: string | null;
  section: string;
  semester: number;
};

export type LocalAttendanceSession = {
  id: string;
  secret: string;
  class_section_id: string;
  subject_id: string | null;
  teacher_id: string;
  is_active: boolean;
  started_at: string;
  ended_at?: string | null;
};

export type LocalAttendanceRecord = {
  id: string;
  session_id: string;
  student_id: string;
  marked_at: string;
  status: string;
};

const STORAGE_KEYS = {
  PROFILES: "cerp_local_profiles",
  DETAILS: "cerp_local_student_details",
  SESSIONS: "cerp_local_sessions",
  RECORDS: "cerp_local_records",
};

// Default initial data for instant demo/offline usage
const DEFAULT_PROFILES: LocalProfile[] = [
  {
    id: "demo-student-1",
    first_name: "Rahul",
    last_name: "Sharma",
    email: "rahul.sharma@campus.edu",
    phone: "+91 98765 43210",
    role: "student",
  },
  {
    id: "demo-student-2",
    first_name: "Priya",
    last_name: "Patel",
    email: "priya.patel@campus.edu",
    phone: "+91 98765 43211",
    role: "student",
  },
  {
    id: "demo-teacher-1",
    first_name: "Dr. Anita",
    last_name: "Verma",
    email: "anita.verma@campus.edu",
    phone: "+91 98765 43212",
    role: "teacher",
  },
];

const DEFAULT_DETAILS: LocalStudentDetail[] = [
  {
    user_id: "demo-student-1",
    roll_number: "CS-2024-001",
    prn: "PRN1001",
    section: "A",
    semester: 4,
  },
  {
    user_id: "demo-student-2",
    roll_number: "CS-2024-002",
    prn: "PRN1002",
    section: "A",
    semester: 4,
  },
];

function getItem<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Could not save to LocalStorage:", err);
  }
}

export const localStore = {
  getProfiles(): LocalProfile[] {
    return getItem(STORAGE_KEYS.PROFILES, DEFAULT_PROFILES);
  },

  getStudentDetails(): LocalStudentDetail[] {
    return getItem(STORAGE_KEYS.DETAILS, DEFAULT_DETAILS);
  },

  getSessions(): LocalAttendanceSession[] {
    return getItem(STORAGE_KEYS.SESSIONS, []);
  },

  getRecords(): LocalAttendanceRecord[] {
    return getItem(STORAGE_KEYS.RECORDS, []);
  },

  saveProfile(profile: LocalProfile): void {
    const list = this.getProfiles().filter((p) => p.id !== profile.id);
    list.push(profile);
    setItem(STORAGE_KEYS.PROFILES, list);
  },

  saveStudentDetail(detail: LocalStudentDetail): void {
    const list = this.getStudentDetails().filter((d) => d.user_id !== detail.user_id);
    list.push(detail);
    setItem(STORAGE_KEYS.DETAILS, list);
  },

  createSession(session: Omit<LocalAttendanceSession, "id"> & { id?: string }): LocalAttendanceSession {
    const sessions = this.getSessions();
    const newSession: LocalAttendanceSession = {
      ...session,
      id: session.id || `sess_${Date.now()}`,
    };
    sessions.push(newSession);
    setItem(STORAGE_KEYS.SESSIONS, sessions);
    return newSession;
  },

  endSession(sessionId: string): void {
    const sessions = this.getSessions().map((s) =>
      s.id === sessionId ? { ...s, is_active: false, ended_at: new Date().toISOString() } : s,
    );
    setItem(STORAGE_KEYS.SESSIONS, sessions);
  },

  addOrUpdateRecord(sessionId: string, studentId: string, status = "approved"): LocalAttendanceRecord {
    const records = this.getRecords();
    const existingIndex = records.findIndex(
      (r) => r.session_id === sessionId && r.student_id === studentId,
    );
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      records[existingIndex] = {
        ...records[existingIndex]!,
        status,
        marked_at: now,
      };
      setItem(STORAGE_KEYS.RECORDS, records);
      return records[existingIndex]!;
    }

    const newRecord: LocalAttendanceRecord = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      session_id: sessionId,
      student_id: studentId,
      marked_at: now,
      status,
    };
    records.push(newRecord);
    setItem(STORAGE_KEYS.RECORDS, records);
    return newRecord;
  },

  deleteRecord(recordId: string): void {
    const records = this.getRecords().filter((r) => r.id !== recordId);
    setItem(STORAGE_KEYS.RECORDS, records);
  },
};
