import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Printer,
  QrCode,
  RefreshCcw,
  Save,
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
import { Textarea } from "@/components/ui/textarea";
import {
  autoSaveAndShareReport,
  exportToExcel,
  exportToPdf,
  shareAttendance,
  type AttendanceExportRow,
  type SessionHeaderInfo,
} from "@/lib/export-utils";
import { openAttendancePdf, saveAttendancePdf } from "@/lib/pdf-export";
import { announceAttendanceUpdate, onAttendanceUpdate } from "@/lib/attendance-events";

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
import { localStore } from "@/lib/local-store";
import type { AttendanceSession, ReportRow } from "@/lib/attendance-types";
import type { AttendanceReport } from "@/lib/attendance.functions";
import {
  buildAttendanceReport,
  endAttendanceSession,
  getActiveSessionForTeacher,
  getClassRoster,
  listAttendance,
  listRecentSessions,
  openAttendanceSession,
  saveClassRoster,
} from "@/lib/attendance.functions";

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

function toExportRows(rows: ReportRow[], header: { className: string; subject: string }) {
  return rows.map<AttendanceExportRow>((row) => ({
    name: row.name,
    roll: row.roll,
    email: row.email,
    phone: row.phone,
    className: header.className,
    subject: header.subject,
    // Absent students have no scan time; the exporters render an empty value as "—".
    markedAt: row.markedAt ?? "",
    status: row.status,
  }));
}

function AttendancePage() {
  const { user, isStaff, profile } = useAuth();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [crName, setCrName] = useState("");
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [token, setToken] = useState("");
  const [starting, setStarting] = useState(false);
  const [approvalScannerOpen, setApprovalScannerOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterDraft, setRosterDraft] = useState("");
  const [savingRoster, setSavingRoster] = useState(false);

  // Reports stay openable after the session stops: they key off the session id, not live state.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [reportGenerated, setReportGenerated] = useState(false);
  const seenStudentsRef = useRef<Set<string> | null>(null);

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
        // Supabase not connected — fall through to the demo sections.
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
        // Supabase not connected — fall through to the demo subjects.
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

  const activeSectionId = session?.classSectionId ?? sectionId;

  const roster = useQuery({
    queryKey: ["class-roster", activeSectionId],
    enabled: Boolean(activeSectionId),
    queryFn: () => getClassRoster({ data: { classSectionId: activeSectionId } }),
  });

  // Reload mid-lecture must not orphan a live QR: ask the server what this teacher is hosting.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void getActiveSessionForTeacher({ data: { teacherId: user.id } }).then((restored) => {
      if (cancelled || !restored) return;
      setSession((current) => current ?? restored);
      setSectionId((current) => current || restored.classSectionId);
      setSubjectId((current) => current || restored.subjectId || "");
      setCrName((current) => current || restored.crName || "");
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Rotate the QR payload every second. The secret only ever reaches the hosting teacher.
  useEffect(() => {
    if (!session) {
      setToken("");
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const next = await buildToken(session.secret, session.id, currentTick());
        if (active) setToken(next);
      } catch {
        // Web Crypto is unavailable over plain http on some browsers; without a real signature
        // the server would reject every scan, so say so instead of showing a useless QR.
        if (active) setToken("");
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session]);

  const present = useQuery({
    queryKey: ["attendance-records", session?.id],
    enabled: Boolean(session?.id),
    refetchInterval: 1000,
    queryFn: () => listAttendance({ data: { sessionId: session!.id } }),
  });

  // Realtime: a scan in any tab on this device invalidates the list; other devices arrive via
  // the 1s poll, so both paths announce the same new rows.
  useEffect(
    () =>
      onAttendanceUpdate((updatedSessionId) => {
        void queryClient.invalidateQueries({ queryKey: ["attendance-records", updatedSessionId] });
        void queryClient.invalidateQueries({ queryKey: ["session-history"] });
      }),
    [queryClient],
  );

  useEffect(() => {
    seenStudentsRef.current = null;
  }, [session?.id]);

  useEffect(() => {
    const rows = present.data;
    if (!rows) return;
    if (!seenStudentsRef.current) {
      seenStudentsRef.current = new Set(rows.map((row) => row.studentId));
      return;
    }
    const seen = seenStudentsRef.current;
    for (const row of rows) {
      if (seen.has(row.studentId)) continue;
      seen.add(row.studentId);
      toast.success(`${row.studentName} marked present`, {
        description: row.rollNumber ? `Roll ${row.rollNumber}` : undefined,
      });
    }
  }, [present.data]);

  const history = useQuery({
    queryKey: ["session-history", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => listRecentSessions({ data: { teacherId: user!.id, limit: 8 } }),
  });

  const rosterStudents = roster.data?.students ?? [];
  const presentCount = present.data?.length ?? 0;

  const openReportFor = useCallback(async (sessionId: string) => {
    setReportBusy(true);
    try {
      const built = await buildAttendanceReport({ data: { sessionId } });
      if (!built) {
        toast.error("No session found on the server for that report.");
        return;
      }
      setReport(built);
      setReportGenerated(false);
      setReportOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Could not load the attendance report.");
    } finally {
      setReportBusy(false);
    }
  }, []);

  async function startSession() {
    if (!user?.id) {
      toast.error("Sign in again to host a session.");
      return;
    }
    const targetSection = sectionId || sections.data?.[0]?.id;
    if (!targetSection) {
      toast.error("Pick a class section first — add one in Administration if the list is empty.");
      return;
    }
    setStarting(true);
    try {
      const created = await openAttendanceSession({
        data: {
          classSectionId: targetSection,
          className: selectedSection
            ? `${selectedSection.name} · Sem ${selectedSection.semester}${selectedSection.section}`
            : targetSection,
          subjectId: subjectId || null,
          subjectName: selectedSubject?.name ?? null,
          subjectCode: selectedSubject?.code ?? null,
          teacherId: user.id,
          teacherName: displayName(profile, "Teacher"),
          crName: crName.trim() || null,
        },
      });
      if (!created) {
        toast.error("The server could not open the session. Attendance will not be recorded.");
        return;
      }
      setSession(created);
      toast.success("Live QR session started.", {
        description: "Students can now scan and mark attendance.",
      });
    } catch (err) {
      console.error("[attendance] open session failed:", err);
      toast.error(
        "Could not start the session on the server. Check that the app server is running.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function stopAndReport() {
    if (!session) return;
    setReportBusy(true);
    const sessionId = session.id;
    try {
      // Stop first so the QR dies immediately, even if report building then fails.
      const ended = await endAttendanceSession({
        data: { sessionId, crName: crName.trim() || null },
      });
      setSession(null);
      announceAttendanceUpdate(sessionId);
      const built = await buildAttendanceReport({ data: { sessionId } });
      if (!built) {
        toast.error("Session stopped, but no records were found on the server.");
        return;
      }
      setReport({ ...built, session: ended ?? built.session });
      setReportOpen(true);
      setReportGenerated(false);
    } catch (err) {
      console.error("[attendance] stop failed:", err);
      toast.error("Could not stop the session on the server.");
    } finally {
      setReportBusy(false);
    }
  }

  const reportHeader = report?.session;

  const headerInfo: SessionHeaderInfo | null = useMemo(() => {
    if (!reportHeader) return null;
    return {
      teacherName: reportHeader.teacherName || displayName(profile, "Teacher"),
      crName: reportHeader.crName || crName.trim() || "N/A",
      subjectName: reportHeader.subjectName || "Lecture",
      subjectCode: reportHeader.subjectCode ?? undefined,
      className: reportHeader.className || reportHeader.classSectionId,
      startedAt: reportHeader.startedAt,
      endedAt: reportHeader.endedAt || new Date().toISOString(),
    };
  }, [reportHeader, crName, profile]);

  const exportRows: AttendanceExportRow[] = useMemo(() => {
    if (!report || !headerInfo) return [];
    return toExportRows(report.rows, {
      className: headerInfo.className,
      subject: headerInfo.subjectName,
    });
  }, [report, headerInfo]);

  function reportTitle(): string {
    if (!headerInfo) return "Attendance_Report";
    return `Attendance_${(headerInfo.className || "Class").replace(/\s+/g, "_")}`;
  }

  async function confirmStopAndGenerate() {
    if (!report || !headerInfo) return;
    setReportBusy(true);
    try {
      await autoSaveAndShareReport(exportRows, headerInfo, report.session.id);
      setReportGenerated(true);
      toast.success("Attendance reports saved to your device", {
        description: `Excel (.csv) and Word (.doc) written for ${report.presentCount} of ${report.totalCount} students.`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Report generation error:", err);
      toast.error("Failed to generate the report files. The session is stopped; PDF still works.");
    } finally {
      setReportBusy(false);
    }
  }

  function withPdf(
    viewer: (rows: ReportRow[], header: SessionHeaderInfo, name: string) => { pageCount: number },
  ) {
    if (!report || !headerInfo) return;
    try {
      const result = viewer(report.rows, headerInfo, reportTitle());
      toast.success(`PDF ready — ${result.pageCount} page${result.pageCount > 1 ? "s" : ""}`, {
        description: `${report.totalCount} students on the sheet (${report.presentCount} present, ${report.absentCount} absent).`,
      });
    } catch (err) {
      console.error("[attendance] pdf generation failed:", err);
      toast.error("PDF generation failed on this device. Try Print instead.");
    }
  }

  function openRosterDialog() {
    const existing = (roster.data?.students ?? [])
      .map((student) =>
        [student.rollNumber ?? "", student.name, student.email ?? "", student.phone ?? ""].join(
          ", ",
        ),
      )
      .join("\n");
    const fromDirectory = localStore
      .getProfiles()
      .filter((p) => p.role === "student")
      .map((p) =>
        [p.id, `${p.first_name} ${p.last_name}`.trim(), p.email, p.phone ?? ""].join(", "),
      )
      .join("\n");
    setRosterDraft(existing || fromDirectory || "");
    setRosterOpen(true);
  }

  async function saveRoster() {
    const students = parseRoster(rosterDraft);
    if (students.length === 0) {
      toast.error("No students recognised — use one line per student: Roll, Name, Email, Phone.");
      return;
    }
    const targetSection = activeSectionId;
    if (!targetSection) {
      toast.error("Choose a class section first.");
      return;
    }
    setSavingRoster(true);
    try {
      const saved = await saveClassRoster({ data: { classSectionId: targetSection, students } });
      if (!saved) {
        toast.error("The server could not save the roster.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["class-roster", targetSection] });
      setRosterOpen(false);
      toast.success(`Roster saved — ${saved.students.length} students will appear in reports.`);
    } catch (err) {
      console.error(err);
      toast.error("Could not save the roster.");
    } finally {
      setSavingRoster(false);
    }
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Class roster</Label>
              <Badge variant={rosterStudents.length > 0 ? "secondary" : "outline"}>
                {rosterStudents.length > 0 ? `${rosterStudents.length} students` : "not set"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              The roster is what puts absent students in the PDF. Without it the report can only
              list whoever scanned.
            </p>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={openRosterDialog}>
              <ClipboardList className="size-4" /> Edit roster
            </Button>
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
                onClick={() => void stopAndReport()}
                disabled={reportBusy}
              >
                {reportBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Stop QR & Generate Report
              </Button>
            </div>
          ) : (
            <Button
              className="w-full gap-2"
              onClick={() => void startSession()}
              disabled={starting || reportBusy}
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
            Each code is signed for a single second and verified on the server against the
            session&apos;s secret, so a shared photo of the QR expires before it can be reused.
            Teachers can also scan a student&apos;s personal code to approve them.
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
                {session.className ?? "Class"} · {presentCount} marked present
                {rosterStudents.length > 0 ? ` of ${rosterStudents.length} enrolled` : ""}
              </p>
            </>
          ) : session ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-destructive">
              <AlertTriangle className="size-10" />
              This page is not served over HTTPS or localhost, so the browser will not sign the QR
              codes. Attendance can only be marked from a secure origin.
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <QrCode className="size-10 text-muted-foreground/50" />
              Pick a class section and subject, then start the session to show the live QR.
            </div>
          )}
        </section>
      </div>

      {session ? (
        <section className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Present students</h2>
              <Badge variant="outline">{presentCount}</Badge>
              {rosterStudents.length > 0 ? (
                <Badge variant="outline" className="text-muted-foreground">
                  {Math.max(0, rosterStudents.length - presentCount)} absent
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={!present.data || present.data.length === 0}
                onClick={() => void openReportFor(session.id)}
              >
                <FileText className="size-3.5 text-blue-600" /> Preview report / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={present.isLoading}
                onClick={() => void present.refetch()}
              >
                <RefreshCcw className="size-3.5" /> Refresh
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {present.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : present.data && present.data.length > 0 ? (
              present.data.map((row) => (
                <article
                  key={row.studentId}
                  className="surface-card flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
                >
                  <p className="font-medium">{row.studentName}</p>
                  <p className="text-sm text-muted-foreground">Roll {row.rollNumber ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{row.email ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{row.phone ?? "—"}</p>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {row.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.markedAt).toLocaleTimeString()}
                  </p>
                </article>
              ))
            ) : (
              <div className="surface-card p-6 text-center text-sm text-muted-foreground">
                Waiting for the first scan… students who mark attendance appear here within a
                second, from any device.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Recent sessions</h2>
        </div>
        <div className="space-y-2">
          {history.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : history.data && history.data.length > 0 ? (
            history.data.map((row) => (
              <article
                key={row.id}
                className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
              >
                <p className="font-medium">{row.subjectName ?? "Session"}</p>
                <p className="text-sm text-muted-foreground">
                  {row.className ?? row.classSectionId}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(row.startedAt).toLocaleString()}
                </p>
                <Badge variant={row.isActive ? "default" : "outline"} className="text-xs">
                  {row.isActive ? "Live" : "Stopped"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto gap-1.5 text-xs"
                  disabled={reportBusy}
                  onClick={() => void openReportFor(row.id)}
                >
                  <FileText className="size-3.5" /> View report / PDF
                </Button>
              </article>
            ))
          ) : (
            <div className="surface-card p-6 text-center text-sm text-muted-foreground">
              No sessions recorded on this server yet.
            </div>
          )}
        </div>
      </section>

      <QrScannerDialog
        open={approvalScannerOpen}
        onOpenChange={(open) => {
          setApprovalScannerOpen(open);
          if (!open && session) {
            void queryClient.invalidateQueries({ queryKey: ["attendance-records", session.id] });
          }
        }}
        sessionId={session?.id || undefined}
        audience="staff"
        title="Approve Student Attendance"
        description="Scan a student's personal QR code, scan their roll-number slip, or type the roll number to approve attendance."
      />

      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="size-5 text-primary" />
              Class roster
            </DialogTitle>
            <DialogDescription>
              One student per line: <code>Roll, Name, Email, Phone</code>. Email and phone are
              optional. Every line becomes a row in the attendance PDF, Present or Absent.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rosterDraft}
            onChange={(e) => setRosterDraft(e.target.value)}
            className="min-h-56 font-mono text-xs"
            placeholder={"CS-2024-001, Rahul Sharma, rahul@campus.edu, +91 98765 43210"}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRosterOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={() => void saveRoster()} disabled={savingRoster}>
              {savingRoster ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save roster
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reportOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReportOpen(false);
            setReportGenerated(false);
            void queryClient.invalidateQueries({ queryKey: ["session-history"] });
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              {reportGenerated ? "Reports generated" : "End session & generate reports"}
            </DialogTitle>
            <DialogDescription>
              {report
                ? `${report.presentCount} present, ${report.absentCount} absent of ${report.totalCount} on the sheet.`
                : "Loading the attendance sheet from the server…"}
            </DialogDescription>
          </DialogHeader>

          {!report ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
                <SummaryRow label="Teacher" value={headerInfo?.teacherName ?? "—"} />
                <SummaryRow
                  label="Subject"
                  value={`${headerInfo?.subjectName ?? "Lecture"}${headerInfo?.subjectCode ? ` (${headerInfo.subjectCode})` : ""}`}
                />
                <SummaryRow label="Class" value={headerInfo?.className ?? "—"} />
                <SummaryRow
                  label="Started"
                  value={new Date(headerInfo?.startedAt ?? Date.now()).toLocaleString()}
                />
                <SummaryRow
                  label="Ended"
                  value={
                    headerInfo?.endedAt
                      ? new Date(headerInfo.endedAt).toLocaleString()
                      : "still running"
                  }
                />
                <SummaryRow label="CR" value={headerInfo?.crName ?? "N/A"} />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attendance</span>
                  <span className="font-semibold text-emerald-600">
                    {report.presentCount} present · {report.absentCount} absent
                  </span>
                </div>
              </div>

              {!reportGenerated ? (
                <div className="space-y-1.5">
                  <Label htmlFor="crNameReport">CR (Class Representative) Name</Label>
                  <Input
                    id="crNameReport"
                    value={crName}
                    onChange={(e) => setCrName(e.target.value)}
                    placeholder="Enter CR name for the report header"
                  />
                </div>
              ) : null}

              {!reportGenerated ? (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => setReportOpen(false)}
                    disabled={reportBusy}
                  >
                    <X className="size-4" /> Close
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={() => void confirmStopAndGenerate()}
                    disabled={reportBusy}
                  >
                    {reportBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Download Excel + Word
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button className="flex-1 gap-1.5" onClick={() => withPdf(saveAttendancePdf)}>
                    <Download className="size-4" /> Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => withPdf(openAttendancePdf)}
                  >
                    <FileText className="size-4 text-blue-600" /> View PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() =>
                      exportToPdf(
                        exportRows,
                        `Class ${headerInfo?.className ?? ""}`,
                        headerInfo ?? undefined,
                      )
                    }
                  >
                    <Printer className="size-3.5 text-blue-600" /> Print
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() =>
                      exportToExcel(exportRows, reportTitle(), headerInfo ?? undefined)
                    }
                  >
                    <FileSpreadsheet className="size-3.5 text-emerald-600" /> Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                    onClick={() =>
                      void shareAttendance(
                        exportRows,
                        `Class ${headerInfo?.className ?? "Campus ERP"}`,
                        headerInfo ?? undefined,
                      )
                    }
                  >
                    <Share2 className="size-3.5 text-emerald-600" /> WhatsApp
                  </Button>
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full gap-1.5"
                onClick={() => setReportOpen(false)}
              >
                <Check className="size-4" /> Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

/** Parses "Roll, Name, Email, Phone" lines into roster students. */
function parseRoster(draft: string) {
  return draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first = "", second = "", third = "", fourth = ""] = line
        .split(/[,;\t]/)
        .map((cell) => cell.trim());
      const looksLikeRoll = /^[A-Za-z0-9/_-]+$/.test(first) && /\d/.test(first);
      const roll = looksLikeRoll ? first : "";
      const name = looksLikeRoll ? second || first : first;
      return {
        studentId: `roll:${(roll || name || line).toUpperCase().replace(/\s+/g, "-")}`,
        name: name || roll || line,
        rollNumber: roll || null,
        email: third || null,
        phone: fourth || null,
      };
    })
    .filter((student) => student.name.length > 0)
    .slice(0, 500);
}
