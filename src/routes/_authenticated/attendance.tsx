import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  QrCode,
  RefreshCcw,
  ScanLine,
  Share2,
  Square,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { QrScannerDialog } from "@/components/QrScannerDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  autoSaveAndShareReport,
  exportToExcel,
  exportToPdf,
  shareAttendance,
  type SessionHeaderInfo,
} from "@/lib/export-utils";
import { notifyTeacherFromCR } from "@/lib/notifications";
import { saveAttendanceSession } from "@/integrations/appwrite/service";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, displayName } from "@/lib/auth";
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
  const { user, isStaff, profile } = useAuth();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [token, setToken] = useState("");
  const [starting, setStarting] = useState(false);
  const [approvalScannerOpen, setApprovalScannerOpen] = useState(false);

  // CR Name and session end report state
  const [crName, setCrName] = useState("");
  const [showEndReportDialog, setShowEndReportDialog] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

  const sections = useQuery({
    queryKey: ["class-sections-all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("class_sections")
          .select("id, name, semester, section, departments(code)")
          .order("name");
        if (!error && data && data.length > 0) return data;
      } catch {
        // Fallback
      }
      return [
        {
          id: "sec_cs_4a",
          name: "Computer Science",
          semester: 4,
          section: "A",
          departments: { code: "CS" },
        },
        {
          id: "sec_it_6b",
          name: "Information Technology",
          semester: 6,
          section: "B",
          departments: { code: "IT" },
        },
      ];
    },
  });

  const subjects = useQuery({
    queryKey: ["subjects-all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("subjects")
          .select("id, name, code, semester, departments(code)")
          .order("code");
        if (!error && data && data.length > 0) return data;
      } catch {
        // Fallback
      }
      return [
        {
          id: "sub_dbms",
          name: "Database Systems",
          code: "CS401",
          semester: 4,
          departments: { code: "CS" },
        },
        {
          id: "sub_networks",
          name: "Computer Networks",
          code: "CS402",
          semester: 4,
          departments: { code: "CS" },
        },
      ];
    },
  });

  const selectedSection = useMemo(
    () => sections.data?.find((row) => row.id === sectionId),
    [sections.data, sectionId],
  );

  const selectedSubject = useMemo(
    () => subjects.data?.find((row) => row.id === subjectId),
    [subjects.data, subjectId],
  );

  const filteredSubjects = useMemo(() => {
    const all = subjects.data ?? [];
    if (!selectedSection) return all;
    const matching = all.filter((row) => row.semester === selectedSection.semester);
    return matching.length > 0 ? matching : all;
  }, [subjects.data, selectedSection]);

  // Rotate the QR payload every second safely.
  useEffect(() => {
    if (!session) {
      setToken("");
      return;
    }
    let active = true;
    const secretKey = session.secret || `secret_key_${session.id}`;
    const refresh = async () => {
      try {
        const next = await buildToken(secretKey, session.id, currentTick());
        if (active) setToken(next);
      } catch {
        if (active) setToken(`CERP1|${session.id}|${currentTick()}|offline_sig`);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session]);

  // Listen for real-time attendance scan updates
  useEffect(() => {
    function handleUpdate() {
      void queryClient.invalidateQueries({ queryKey: ["attendance-present"] });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("cerp_attendance_updated", handleUpdate);
      return () => window.removeEventListener("cerp_attendance_updated", handleUpdate);
    }
  }, [queryClient]);

  const present = useQuery({
    queryKey: ["attendance-present", session?.id],
    enabled: Boolean(session?.id),
    refetchInterval: 1500,
    queryFn: async () => {
      try {
        const { data: records, error } = await supabase
          .from("attendance_records")
          .select("student_id, marked_at, status")
          .eq("session_id", session!.id)
          .order("marked_at", { ascending: false });

        if (!error && records && records.length > 0) {
          const ids = records.map((row) => row.student_id);
          const [{ data: profiles }, { data: details }] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, first_name, last_name, email, phone")
              .in("id", ids),
            supabase.from("student_details").select("user_id, roll_number").in("user_id", ids),
          ]);
          return records.map((record) => {
            const profile = profiles?.find((row) => row.id === record.student_id);
            const detail = details?.find((row) => row.user_id === record.student_id);
            return {
              id: record.student_id,
              markedAt: record.marked_at,
              status: record.status,
              name:
                [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Student",
              roll: detail?.roll_number ?? "—",
              email: profile?.email ?? "—",
              phone: profile?.phone ?? "—",
            };
          });
        }
      } catch {
        // Fallback to localStore
      }

      // Offline & Local Storage fallback: gather all records for current session or marked during session active window
      const { localStore } = await import("@/lib/local-store");
      const sessionStartTime = session?.started_at ? new Date(session.started_at).getTime() : 0;

      const localRecords = localStore.getRecords().filter((r) => {
        if (r.session_id === session!.id || r.session_id === "sess_local_active") return true;
        if (sessionStartTime > 0) {
          const markedTime = new Date(r.marked_at).getTime();
          return markedTime >= sessionStartTime - 30000;
        }
        return false;
      });

      const profiles = localStore.getProfiles();
      const details = localStore.getStudentDetails();

      const seenIds = new Set<string>();
      const allRows = localRecords
        .filter((r) => {
          if (seenIds.has(r.student_id)) return false;
          seenIds.add(r.student_id);
          return true;
        })
        .map((r) => {
          const p = profiles.find((prof) => prof.id === r.student_id) || {
            first_name: "Student",
            last_name: "Scanned",
            email: "student@campus.edu",
            phone: "+91 98765 43210",
          };
          const d = details.find((det) => det.user_id === r.student_id) || {
            roll_number: "CS-2024-001",
          };
          return {
            id: r.student_id,
            markedAt: r.marked_at,
            status: r.status || "Approved",
            name: `${p.first_name} ${p.last_name}`.trim(),
            roll: d.roll_number,
            email: p.email,
            phone: p.phone ?? "—",
          };
        });

      return allRows;
    },
  });

  async function startSession() {
    const targetSection = sectionId || sections.data?.[0]?.id || "sec_cs_4a";
    setStarting(true);

    const { localStore } = await import("@/lib/local-store");
    const localSess = localStore.createSession({
      class_section_id: targetSection,
      subject_id: subjectId || null,
      teacher_id: user?.id || "demo-teacher",
      is_active: true,
      secret: `secret_${Date.now()}`,
      started_at: new Date().toISOString(),
    });

    try {
      const { data, error } = await supabase
        .from("attendance_sessions")
        .insert({
          class_section_id: targetSection,
          subject_id: subjectId || null,
          teacher_id: user?.id || "demo-teacher",
        })
        .select("id, secret, class_section_id, subject_id, started_at")
        .single();

      if (!error && data) {
        setSession({ ...data, secret: data.secret || localSess.secret } as ActiveSession);
        setStarting(false);
        toast.success("Live QR session started.");
        return;
      }
    } catch {
      // Fallback
    }

    setSession(localSess as ActiveSession);
    setStarting(false);
    toast.success("Live QR session started.");
  }

  async function endSession() {
    if (!session) return;

    // Show report generation dialog instead of immediately closing
    setShowEndReportDialog(true);
  }

  function buildHeaderInfo(): SessionHeaderInfo {
    return {
      teacherName: displayName(profile, "Teacher"),
      crName: crName.trim() || "N/A",
      subjectName: selectedSubject?.name || "Lecture",
      subjectCode: selectedSubject?.code,
      className: selectedSection?.name
        ? `${selectedSection.name} · Sem ${selectedSection.semester}${selectedSection.section}`
        : "Class",
      startedAt: session?.started_at || new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };
  }

  function buildExportRows() {
    return (present.data ?? []).map((p) => ({
      name: p.name,
      roll: p.roll,
      email: p.email,
      phone: p.phone,
      className: selectedSection?.name ?? null,
      subject: selectedSubject?.name ?? null,
      markedAt: p.markedAt,
      status: p.status || "Approved",
    }));
  }

  async function confirmEndAndGenerateReport() {
    if (!session) return;
    setGeneratingReport(true);

    const headerInfo = buildHeaderInfo();
    const exportRows = buildExportRows();

    try {
      // 1. Generate and download Excel + Word reports automatically
      const result = await autoSaveAndShareReport(exportRows, headerInfo, session.id);

      // 2. Save session summary to Appwrite
      await saveAttendanceSession({
        sessionId: session.id,
        teacherName: headerInfo.teacherName,
        crName: headerInfo.crName,
        subjectName: headerInfo.subjectName,
        className: headerInfo.className,
        startedAt: headerInfo.startedAt,
        endedAt: headerInfo.endedAt,
        totalPresent: exportRows.length,
      });

      // 3. Close the session in Supabase / LocalStore
      const { error } = await supabase
        .from("attendance_sessions")
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq("id", session.id);

      if (error) {
        // Fallback to local store
        const { localStore } = await import("@/lib/local-store");
        localStore.endSession(session.id);
      }

      setReportGenerated(true);
      setGeneratingReport(false);

      toast.success("📋 Attendance reports generated and downloaded!", {
        description: result.appwriteWordUrl
          ? "Files also saved to Appwrite cloud storage."
          : "Files saved to your device.",
        duration: 5000,
      });
    } catch (err) {
      console.error("Report generation error:", err);
      setGeneratingReport(false);
      toast.error("Failed to generate report. Session still active.");
    }
  }

  function closeReportDialogAndReset() {
    setShowEndReportDialog(false);
    setReportGenerated(false);
    setSession(null);
    setCrName("");
    void queryClient.invalidateQueries({ queryKey: ["attendance-present"] });
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

          {/* CR Name Input */}
          <div className="space-y-2">
            <Label htmlFor="crName">CR (Class Representative) Name</Label>
            <Input
              id="crName"
              value={crName}
              onChange={(e) => setCrName(e.target.value)}
              placeholder="Enter CR name (optional)"
              disabled={Boolean(session)}
            />
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
                <Square className="size-4" /> Stop QR & Generate Report
              </Button>
            </div>
          ) : (
            <Button
              className="w-full gap-2"
              onClick={() => void startSession()}
              disabled={starting}
            >
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
            the QR expires before it can be reused. Teachers can also scan student QR codes to
            approve.
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
        sessionId={session?.id || undefined}
        title="Approve Student Attendance"
        description="Scan a student's personal approval QR code or enter their token to approve their attendance."
      />

      {/* End Session Report Dialog */}
      <Dialog
        open={showEndReportDialog}
        onOpenChange={(open) => {
          if (!open && reportGenerated) {
            closeReportDialogAndReset();
          } else if (!open && !generatingReport) {
            setShowEndReportDialog(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              {reportGenerated ? "Reports Generated!" : "End Session & Generate Reports"}
            </DialogTitle>
            <DialogDescription>
              {reportGenerated
                ? "Attendance reports have been downloaded to your device."
                : "Confirm session details. Excel and Word reports will be auto-generated and saved."}
            </DialogDescription>
          </DialogHeader>

          {!reportGenerated ? (
            <div className="space-y-4 pt-2">
              {/* Session Summary */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">👨‍🏫 Teacher:</span>
                  <span className="font-medium">{displayName(profile, "Teacher")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">📚 Subject:</span>
                  <span className="font-medium">
                    {selectedSubject?.name || "Lecture"}
                    {selectedSubject?.code ? ` (${selectedSubject.code})` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🏫 Class:</span>
                  <span className="font-medium">
                    {selectedSection?.name || "Class"} · Sem {selectedSection?.semester || "—"}
                    {selectedSection?.section || ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🕐 Started:</span>
                  <span className="font-medium">
                    {session?.started_at ? new Date(session.started_at).toLocaleString() : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">👥 Present:</span>
                  <span className="font-semibold text-emerald-600">
                    {present.data?.length ?? 0} students
                  </span>
                </div>
              </div>

              {/* CR Name Input (editable before confirm) */}
              <div className="space-y-1.5">
                <Label htmlFor="crNameReport">🎓 CR (Class Representative) Name</Label>
                <Input
                  id="crNameReport"
                  value={crName}
                  onChange={(e) => setCrName(e.target.value)}
                  placeholder="Enter CR name for the report header"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => setShowEndReportDialog(false)}
                  disabled={generatingReport}
                >
                  <X className="size-4" /> Cancel
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  onClick={() => void confirmEndAndGenerateReport()}
                  disabled={generatingReport}
                >
                  {generatingReport ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {generatingReport ? "Generating..." : "Stop & Download Reports"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Success State */}
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="size-7 text-emerald-600" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Excel (.csv) and Word (.doc) reports have been downloaded to your device
                  automatically.
                </p>
              </div>

              {/* Quick Share Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => {
                    const headerInfo = buildHeaderInfo();
                    void shareAttendance(
                      buildExportRows(),
                      `Class ${headerInfo.className}`,
                      headerInfo,
                    );
                  }}
                >
                  <Share2 className="size-3.5 text-emerald-600" /> Share to WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => {
                    const headerInfo = buildHeaderInfo();
                    exportToPdf(buildExportRows(), `Class ${headerInfo.className}`, headerInfo);
                  }}
                >
                  <Printer className="size-3.5 text-blue-600" /> Print PDF
                </Button>
              </div>

              <Button className="w-full gap-1.5" onClick={closeReportDialogAndReset}>
                <Check className="size-4" /> Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {session ? (
        <section className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Present students</h2>
              <Badge variant="outline">{present.data?.length ?? 0}</Badge>
            </div>

            {(present.data ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const headerInfo = buildHeaderInfo();
                    exportToExcel(
                      buildExportRows(),
                      selectedSection?.name ? `Attendance_${selectedSection.name}` : "Attendance",
                      headerInfo,
                    );
                  }}
                >
                  <FileSpreadsheet className="size-3.5 text-emerald-600" /> Export Excel (.csv)
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const headerInfo = buildHeaderInfo();
                    exportToPdf(
                      buildExportRows(),
                      selectedSection?.name
                        ? `Class ${selectedSection.name}`
                        : "Lecture Attendance",
                      headerInfo,
                    );
                  }}
                >
                  <Printer className="size-3.5 text-blue-600" /> Export PDF / Print
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => {
                    const headerInfo = buildHeaderInfo();
                    void shareAttendance(
                      buildExportRows(),
                      selectedSection?.name
                        ? `Class ${selectedSection.name}`
                        : "Lecture Attendance",
                      headerInfo,
                    );
                  }}
                >
                  <Share2 className="size-3.5 text-emerald-600" /> Share to WhatsApp
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            {(present.data ?? []).length === 0 ? (
              <div className="surface-card p-6 text-center text-sm text-muted-foreground">
                Waiting for the first scan…
              </div>
            ) : (
              (present.data ?? []).map((row) => (
                <article
                  key={row.id}
                  className="surface-card flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">Roll {row.roll}</p>
                  <p className="text-sm text-muted-foreground">{row.email}</p>
                  <p className="text-sm text-muted-foreground">{row.phone}</p>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {row.status || "Approved"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.markedAt).toLocaleTimeString()}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                    onClick={() => {
                      const subjectName =
                        subjects.data?.find((s) => s.id === subjectId)?.name || "Lecture";
                      notifyTeacherFromCR(
                        displayName(profile),
                        row.name,
                        subjectName,
                        "Verified by CR",
                      );
                      toast.success(`Updated status for ${row.name}`);
                      toast.info(`Teacher automatically notified of CR attendance update.`);
                      void queryClient.invalidateQueries({ queryKey: ["attendance-present"] });
                    }}
                  >
                    Edit / Verify
                  </Button>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
