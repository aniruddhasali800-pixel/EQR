import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, QrCode, RefreshCcw, ScanLine, Square, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { QrScannerDialog } from "@/components/QrScannerDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { buildToken, currentTick } from "@/lib/qr-token";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "Live QR Attendance — Campus ERP" },
      {
        name: "description",
        content:
          "Start a lecture attendance session and project a secure QR code that rotates every second.",
      },
      { property: "og:title", content: "Live QR Attendance — Campus ERP" },
      {
        property: "og:description",
        content: "Rotating one-second QR codes make proxy attendance practically impossible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttendancePage,
});

type ActiveSession = {
  id: string;
  secret: string;
  class_section_id: string;
  subject_id: string | null;
  started_at: string;
};

function AttendancePage() {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [token, setToken] = useState("");
  const [starting, setStarting] = useState(false);
  const [approvalScannerOpen, setApprovalScannerOpen] = useState(false);

  const sections = useQuery({
    queryKey: ["class-sections-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sections")
        .select("id, name, semester, section, departments(code)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useQuery({
    queryKey: ["subjects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, code, semester, departments(code)")
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedSection = useMemo(
    () => sections.data?.find((row) => row.id === sectionId),
    [sections.data, sectionId],
  );

  const filteredSubjects = useMemo(() => {
    const all = subjects.data ?? [];
    if (!selectedSection) return all;
    const matching = all.filter((row) => row.semester === selectedSection.semester);
    return matching.length > 0 ? matching : all;
  }, [subjects.data, selectedSection]);

  // Rotate the QR payload every second.
  useEffect(() => {
    if (!session) {
      setToken("");
      return;
    }
    let active = true;
    const refresh = async () => {
      const next = await buildToken(session.secret, session.id, currentTick());
      if (active) setToken(next);
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session]);

  const present = useQuery({
    queryKey: ["attendance-present", session?.id],
    enabled: Boolean(session?.id),
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("attendance_records")
        .select("student_id, marked_at, status")
        .eq("session_id", session!.id)
        .order("marked_at", { ascending: false });
      if (error) throw error;
      const ids = (records ?? []).map((row) => row.student_id);
      if (ids.length === 0) return [];
      const [{ data: profiles }, { data: details }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, email, phone").in("id", ids),
        supabase.from("student_details").select("user_id, roll_number").in("user_id", ids),
      ]);
      return (records ?? []).map((record) => {
        const profile = profiles?.find((row) => row.id === record.student_id);
        const detail = details?.find((row) => row.user_id === record.student_id);
        return {
          id: record.student_id,
          markedAt: record.marked_at,
          status: record.status,
          name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Student",
          roll: detail?.roll_number ?? "—",
          email: profile?.email ?? "—",
          phone: profile?.phone ?? "—",
        };
      });
    },
  });

  async function startSession() {
    if (!sectionId || !user?.id) {
      toast.error("Select a class section first.");
      return;
    }
    setStarting(true);
    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        class_section_id: sectionId,
        subject_id: subjectId || null,
        teacher_id: user.id,
      })
      .select("id, secret, class_section_id, subject_id, started_at")
      .single();
    setStarting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSession(data as ActiveSession);
    toast.success("Live QR session started.");
  }

  async function endSession() {
    if (!session) return;
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("id", session.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSession(null);
    void queryClient.invalidateQueries({ queryKey: ["attendance-present"] });
    toast.success("Session closed.");
  }

  if (!isStaff) {
    return (
      <AppShell title="Live QR attendance" description="Teachers and admins only">
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Only teachers, HODs, principals and admins can host an attendance session. Students mark
          attendance from the dashboard scanner.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Live QR attendance"
      description="Project the rotating QR code — it changes every second, so screenshots are useless."
      actions={
        session ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setApprovalScannerOpen(true)}
          >
            <ScanLine className="size-4 text-primary" />
            <span className="hidden sm:inline">Scan & Approve Student</span>
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="surface-card space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">Session setup</h2>

          <div className="space-y-2">
            <Label>Class section</Label>
            {sections.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={sectionId} onValueChange={setSectionId} disabled={Boolean(session)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class section" />
                </SelectTrigger>
                <SelectContent>
                  {(sections.data ?? []).length === 0 ? (
                    <SelectItem value="none" disabled>
                      No class sections yet — add them in Administration
                    </SelectItem>
                  ) : (
                    (sections.data ?? []).map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name} · Sem {row.semester}
                        {row.section}
                        {row.departments?.code ? ` · ${row.departments.code}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            {subjects.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={subjectId} onValueChange={setSubjectId} disabled={Boolean(session)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSubjects.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No subjects yet — add them in Administration
                    </SelectItem>
                  ) : (
                    filteredSubjects.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} · {row.name}
                        {row.semester ? ` (Sem ${row.semester})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {session ? (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setApprovalScannerOpen(true)}
              >
                <ScanLine className="size-4" /> Scan & Approve Student QR
              </Button>
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={() => void endSession()}
              >
                <Square className="size-4" /> End session
              </Button>
            </div>
          ) : (
            <Button className="w-full gap-2" onClick={() => void startSession()} disabled={starting}>
              {starting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              Start live QR
            </Button>
          )}

          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            Each code is signed for a single second and verified on the server, so a shared photo of
            the QR expires before it can be reused. Teachers can also scan student QR codes to approve.
          </div>
        </section>

        <section className="surface-card flex flex-col items-center justify-center gap-4 p-6">
          {session && token ? (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <QRCodeSVG value={token} size={248} level="M" />
              </div>
              <Badge variant="secondary" className="gap-1">
                <RefreshCcw className="size-3.5 animate-spin [animation-duration:1s]" />
                Refreshing every second
              </Badge>
              <p className="text-center text-sm text-muted-foreground">
                {selectedSection?.name ?? "Class"} · {present.data?.length ?? 0} marked present
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <QrCode className="size-10 text-muted-foreground/50" />
              Pick a class section and subject, then start the session to show the live QR.
            </div>
          )}
        </section>
      </div>

      <QrScannerDialog
        open={approvalScannerOpen}
        onOpenChange={(open) => {
          setApprovalScannerOpen(open);
          if (!open) {
            void queryClient.invalidateQueries({ queryKey: ["attendance-present"] });
          }
        }}
        sessionId={session?.id}
        title="Approve Student Attendance"
        description="Scan a student's personal approval QR code or enter their token to approve their attendance."
      />

      {session ? (
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h2 className="text-lg font-semibold">Present students</h2>
            <Badge variant="outline">{present.data?.length ?? 0}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {(present.data ?? []).length === 0 ? (
              <div className="surface-card p-6 text-center text-sm text-muted-foreground">
                Waiting for the first scan…
              </div>
            ) : (
              (present.data ?? []).map((row) => (
                <article key={row.id} className="surface-card flex flex-wrap items-center gap-x-6 gap-y-1 p-4">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">Roll {row.roll}</p>
                  <p className="text-sm text-muted-foreground">{row.email}</p>
                  <p className="text-sm text-muted-foreground">{row.phone}</p>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    Approved
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.markedAt).toLocaleTimeString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

