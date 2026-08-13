import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Users,
  GraduationCap,
  MessageSquare,
  Upload,
  Send,
  FileText,
  Clock,
  UserCheck,
  ShieldAlert,
  Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { displayName, useAuth } from "@/lib/auth";
import { localStore, type LocalProfile } from "@/lib/local-store";
import {
  groupChatStore,
  DEMO_TEACHERS,
  type GroupChatMessage,
  type GroupTimetable,
} from "@/lib/group-chat";

export const Route = createFileRoute("/_authenticated/timetable")({
  head: () => ({
    meta: [
      { title: "Class Group & Timetable — Campus ERP" },
      {
        name: "description",
        content: "Class group messaging, student rosters, teacher contacts and timetable uploads.",
      },
    ],
  }),
  component: TimetableGroupPage,
});

const BRANCH_TITLES: Record<string, string> = {
  computer: "Computer Engineering",
  mechanical: "Mechanical Engineering",
  electrical: "Electrical Engineering",
  civil: "Civil Engineering",
};

const YEAR_TITLES: Record<string, string> = {
  first_year: "1st Year (FE)",
  second_year: "2nd Year (SE)",
  third_year: "3rd Year (TE)",
  final_year: "Final Year (BE)",
};

function TimetableGroupPage() {
  const { profile, roles, hasAnyRole } = useAuth();

  // Authority check: Teacher, HOD, and CR have permission to upload timetable
  const canUploadTimetable = hasAnyRole(["teacher", "hod", "cr", "super_admin", "principal"]);

  // Group ID based on user department or default mechanical_second_year
  const branchKey = "mechanical";
  const yearKey = "second_year";
  const groupId = `${branchKey}_${yearKey}`;

  const branchTitle = BRANCH_TITLES[branchKey] || "Mechanical Engineering";
  const yearTitle = YEAR_TITLES[yearKey] || "2nd Year (SE)";

  // Local state for chat & roster
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [students, setStudents] = useState<LocalProfile[]>([]);
  const [timetableRecord, setTimetableRecord] = useState<GroupTimetable | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [timetablePreview, setTimetablePreview] = useState<string | null>(null);

  useEffect(() => {
    // Load group messages & timetable
    setMessages(groupChatStore.getMessages(groupId));
    setTimetableRecord(groupChatStore.getTimetable(groupId));

    // Load student list (privacy: names only shown)
    const allProfiles = localStore.getProfiles();
    const studentList = allProfiles.filter((p) => p.role === "student" || p.role === "cr");
    setStudents(
      studentList.length > 0
        ? studentList
        : [
            {
              id: "s1",
              first_name: "Rahul",
              last_name: "Sharma",
              email: "rahul@campus.edu",
              role: "student",
            },
            {
              id: "s2",
              first_name: "Priya",
              last_name: "Patel",
              email: "priya@campus.edu",
              role: "student",
            },
            {
              id: "s3",
              first_name: "Aman",
              last_name: "Gupta",
              email: "aman@campus.edu",
              role: "cr",
            },
            {
              id: "s4",
              first_name: "Neha",
              last_name: "Singh",
              email: "neha@campus.edu",
              role: "student",
            },
          ],
    );
  }, [groupId]);

  // Send group message
  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const senderName = displayName(profile);
    const senderRole = roles[0] ? roles[0].toUpperCase() : "STUDENT";

    const msg = groupChatStore.sendMessage(
      groupId,
      profile?.id || "user_1",
      senderName,
      senderRole,
      newMessage,
    );

    setMessages((prev) => [...prev, msg]);
    setNewMessage("");
    toast.success("Message posted to class group");
  }

  // Handle Timetable File Upload (Teacher / HOD / CR authority)
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTimetablePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSaveTimetableUpload() {
    if (!timetablePreview) {
      toast.error("Please select a timetable image or PDF first");
      return;
    }

    const uploaderName = displayName(profile);
    const uploaderRole = roles[0] ? roles[0].toUpperCase() : "TEACHER";

    const saved = groupChatStore.saveTimetable(
      groupId,
      uploaderName,
      uploaderRole,
      timetablePreview,
    );
    setTimetableRecord(saved);
    setUploadOpen(false);
    toast.success("Class timetable uploaded successfully!");
  }

  return (
    <AppShell
      title="Class Group & Timetable"
      description={`${branchTitle} · ${yearTitle}`}
      actions={
        canUploadTimetable ? (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 bg-primary">
                <Upload className="size-4" />
                <span>Upload Timetable</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Class Timetable</DialogTitle>
                <DialogDescription>
                  Authority: Only Teachers, HODs & CRs can update the group timetable.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tt-file">Select Timetable Image / File</Label>
                  <Input
                    id="tt-file"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                  />
                </div>

                {timetablePreview ? (
                  <div className="rounded-lg border p-2 bg-muted/40">
                    <p className="text-xs font-semibold mb-2 text-emerald-600">
                      File Preview Loaded
                    </p>
                    <img
                      src={timetablePreview}
                      alt="Timetable preview"
                      className="max-h-48 rounded object-cover w-full"
                    />
                  </div>
                ) : null}

                <Button className="w-full" onClick={handleSaveTimetableUpload}>
                  Publish Timetable to Class
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Badge variant="outline" className="gap-1.5 text-xs">
            <ShieldAlert className="size-3.5 text-muted-foreground" />
            Timetable Upload: Teacher/HOD/CR Only
          </Badge>
        )
      }
    >
      <div className="space-y-6">
        {/* Class Group Banner */}
        <div className="surface-card p-6 rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-background flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs">
                Active Group
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">ID: {groupId}</span>
            </div>
            <h2 className="text-xl font-bold font-display">{branchTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {yearTitle} · Enrolled Class Group & Live Discussions
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center px-3 py-1.5 rounded-xl bg-card border">
              <p className="text-lg font-bold text-primary">{students.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                Total Students
              </p>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl bg-card border">
              <p className="text-lg font-bold text-emerald-600">{DEMO_TEACHERS.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Teachers</p>
            </div>
          </div>
        </div>

        {/* Tabs for Timetable, Group Chat, Students & Teachers */}
        <Tabs defaultValue="timetable" className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-xl">
            <TabsTrigger value="timetable" className="gap-1.5">
              <FileText className="size-4" />
              <span>Timetable</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageSquare className="size-4" />
              <span>Group Chat</span>
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-1.5">
              <Users className="size-4" />
              <span>Students ({students.length})</span>
            </TabsTrigger>
            <TabsTrigger value="teachers" className="gap-1.5">
              <GraduationCap className="size-4" />
              <span>Teachers</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Timetable Display */}
          <TabsContent value="timetable" className="mt-4 space-y-4">
            {timetableRecord?.file_url ? (
              <div className="surface-card p-6 rounded-2xl border space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <h3 className="font-semibold text-base">Class Schedule</h3>
                    <p className="text-xs text-muted-foreground">
                      Uploaded by {timetableRecord.uploaded_by_name} (
                      {timetableRecord.uploaded_by_role}) on{" "}
                      {new Date(timetableRecord.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="secondary">Official Schedule</Badge>
                </div>
                <img
                  src={timetableRecord.file_url}
                  alt="Class Timetable"
                  className="w-full max-h-[500px] object-contain rounded-xl border"
                />
              </div>
            ) : (
              <div className="surface-card p-8 rounded-2xl border text-center space-y-3">
                <FileText className="size-10 text-muted-foreground mx-auto" />
                <h3 className="font-semibold text-base">No Timetable Uploaded Yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {canUploadTimetable
                    ? "Click the 'Upload Timetable' button above to publish the class schedule image or file."
                    : "Your class teacher or CR will upload the schedule here shortly."}
                </p>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: Class Group Chat */}
          <TabsContent value="chat" className="mt-4 space-y-4">
            <div className="surface-card p-4 rounded-2xl border flex flex-col h-[480px]">
              <div className="border-b pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" />
                  <h3 className="font-semibold text-sm">{branchTitle} Class Discussion</h3>
                </div>
                <span className="text-xs text-emerald-600 font-medium">● Group Live</span>
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-10">
                    No messages yet. Be the first to start the group discussion!
                  </p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{m.sender_name}</span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1">
                          {m.sender_role}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="bg-muted/60 p-3 rounded-xl rounded-tl-none text-xs max-w-lg">
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="flex gap-2 pt-2 border-t">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message to the class group..."
                  className="flex-1"
                />
                <Button type="submit" size="icon" className="shrink-0">
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </TabsContent>

          {/* TAB 3: Enrolled Students List (Privacy: Names Only) */}
          <TabsContent value="students" className="mt-4 space-y-4">
            <div className="surface-card p-6 rounded-2xl border space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="font-semibold text-base">Class Roster</h3>
                  <p className="text-xs text-muted-foreground">
                    Names of all enrolled students in {branchTitle}
                  </p>
                </div>
                <Badge variant="secondary">Total Students: {students.length}</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {students.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {st.first_name[0]}
                        {st.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {st.first_name} {st.last_name}
                      </p>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {st.role === "cr" ? "⭐ Class Rep (CR)" : "Student"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: Faculty / Teachers Details */}
          <TabsContent value="teachers" className="mt-4 space-y-4">
            <div className="surface-card p-6 rounded-2xl border space-y-4">
              <div className="border-b pb-3">
                <h3 className="font-semibold text-base">Assigned Faculty</h3>
                <p className="text-xs text-muted-foreground">
                  Teachers and subject leads for {branchTitle}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DEMO_TEACHERS.map((t) => (
                  <div key={t.id} className="p-4 rounded-xl border bg-card space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-10">
                        <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-bold">
                          {t.name.split(" ")[1]?.[0] || "T"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-semibold text-sm">{t.name}</h4>
                        <p className="text-xs text-primary font-medium">{t.subject}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t text-xs text-muted-foreground flex items-center justify-between">
                      <span>Dept: {t.department}</span>
                      <span className="font-mono text-[11px]">{t.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
