/**
 * Class Group Chat & Timetable Upload Engine
 * Supports automated branch/year class groups, group messaging, student rosters,
 * teacher listings, and restricted timetable uploads (Teacher, HOD, CR).
 */

export type GroupChatMessage = {
  id: string;
  group_id: string; // e.g. "mechanical_second_year"
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
};

export type GroupTimetable = {
  group_id: string;
  uploaded_by_name: string;
  uploaded_by_role: string;
  file_url: string;
  updated_at: string;
};

const STORAGE_KEYS = {
  MESSAGES: "cerp_group_messages",
  TIMETABLES: "cerp_group_timetables",
};

// Pre-populated demo teachers for groups
export const DEMO_TEACHERS = [
  {
    id: "tech_1",
    name: "Prof. Rajesh Kumar",
    subject: "Thermodynamics",
    email: "rajesh.kumar@campus.edu",
    department: "Mechanical",
  },
  {
    id: "tech_2",
    name: "Dr. Sunita Rao",
    subject: "Fluid Mechanics",
    email: "sunita.rao@campus.edu",
    department: "Mechanical",
  },
  {
    id: "tech_3",
    name: "Prof. Amit Verma",
    subject: "Data Structures & Algorithms",
    email: "amit.verma@campus.edu",
    department: "Computer",
  },
  {
    id: "tech_4",
    name: "Dr. Meera Joshi",
    subject: "Circuit Theory",
    email: "meera.joshi@campus.edu",
    department: "Electrical",
  },
];

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
    console.warn("[group-chat] Storage write failed:", err);
  }
}

// Initial demo messages for instant user feedback
const DEFAULT_MESSAGES: GroupChatMessage[] = [
  {
    id: "msg_1",
    group_id: "mechanical_second_year",
    sender_id: "tech_1",
    sender_name: "Prof. Rajesh Kumar",
    sender_role: "Teacher",
    content:
      "Welcome to the 2nd Year Mechanical Class Group! Please check the latest timetable below.",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "msg_2",
    group_id: "mechanical_second_year",
    sender_id: "cr_1",
    sender_name: "Aman Gupta (CR)",
    sender_role: "CR",
    content: "Reminder: Thermodynamics lab records are due tomorrow by 2 PM.",
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
];

export const groupChatStore = {
  getMessages(groupId: string): GroupChatMessage[] {
    const all = getStored<GroupChatMessage[]>(STORAGE_KEYS.MESSAGES, DEFAULT_MESSAGES);
    return all.filter((m) => m.group_id === groupId);
  },

  sendMessage(
    groupId: string,
    senderId: string,
    senderName: string,
    senderRole: string,
    content: string,
    attachmentUrl?: string,
  ): GroupChatMessage {
    const all = getStored<GroupChatMessage[]>(STORAGE_KEYS.MESSAGES, DEFAULT_MESSAGES);
    const newMessage: GroupChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      group_id: groupId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      content: content.trim(),
      attachment_url: attachmentUrl || null,
      created_at: new Date().toISOString(),
    };

    all.push(newMessage);
    setStored(STORAGE_KEYS.MESSAGES, all);
    return newMessage;
  },

  getTimetable(groupId: string): GroupTimetable | null {
    const list = getStored<GroupTimetable[]>(STORAGE_KEYS.TIMETABLES, []);
    return list.find((t) => t.group_id === groupId) || null;
  },

  saveTimetable(
    groupId: string,
    uploadedByName: string,
    uploadedByRole: string,
    fileUrl: string,
  ): GroupTimetable {
    const list = getStored<GroupTimetable[]>(STORAGE_KEYS.TIMETABLES, []);
    const filtered = list.filter((t) => t.group_id !== groupId);
    const newRecord: GroupTimetable = {
      group_id: groupId,
      uploaded_by_name: uploadedByName,
      uploaded_by_role: uploadedByRole,
      file_url: fileUrl,
      updated_at: new Date().toISOString(),
    };
    filtered.push(newRecord);
    setStored(STORAGE_KEYS.TIMETABLES, filtered);
    return newRecord;
  },
};
