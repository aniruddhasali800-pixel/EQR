import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

import {
  Users,
  GraduationCap,
  Building2,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  QrCode,
  ScanLine,
  UserCheck,
  Database,
  Filter,
  Layers,
  Cloud,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { QrScannerDialog } from "@/components/QrScannerDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_LABELS, displayName, useAuth } from "@/lib/auth";
import { buildStudentToken } from "@/lib/qr-token";
import { DAY_NAMES, formatTime } from "@/lib/timetable";
import { localStore } from "@/lib/local-store";
import { listStudentMarks } from "@/lib/attendance.functions";
import { isAppwriteConfigured } from "@/integrations/appwrite/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Campus ERP" },
      {
        name: "description",
        content: "Branch-wise Campus ERP dashboard: student totals, teacher lists, and schedules.",
      },
    ],
  }),
  component: Dashboard,
});

// Branch metadata & branch-wise stats mock generator
const BRANCH_DATA: Record<
  string,
  { name: string; students: number; teachers: number; subjects: number; sections: number }
> = {
  all: { name: "All Engineering Branches", students: 11, teachers: 15, subjects: 15, sections: 6 },
  mechanical: {
    name: "Mechanical Engineering",
    students: 2,
    teachers: 4,
    subjects: 4,
    sections: 2,
  },
  civil: { name: "Civil Engineering", students: 3, teachers: 3, subjects: 3, sections: 1 },
  computer: { name: "Computer Engineering", students: 4, teachers: 5, subjects: 5, sections: 2 },
  electrical: {
    name: "Electrical Engineering",
    students: 2,
    teachers: 3,
    subjects: 3,
    sections: 1,
  },
};

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  subtext?: string;
}) {
  return (
    <div className="surface-card p-5 rounded-2xl border transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {subtext ? <p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function Dashboard() {
  const { profile, roles, isStaff, user } = useAuth();
  const queryClient = useQueryClient();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [studentQrOpen, setStudentQrOpen] = useState(false);

  // Admin & Teacher Branch Filter
  const [selectedBranch, setSelectedBranch] = useState("mechanical");
  const [selectedYear, setSelectedYear] = useState("all");

  const todayDow = new Date().getDay();
  const studentQrToken = user?.id ? buildStudentToken(user.id) : "";

  // My attendance, read back from the server so a mark is only claimed when it is stored.
  const myRoll = user?.id
    ? (localStore.getStudentDetails().find((d) => d.user_id === user.id)?.roll_number ?? null)
    : null;
  const myMarks = useQuery({
    queryKey: ["my-marks", user?.id],
    enabled: Boolean(user?.id),
    refetchInterval: 5000,
    queryFn: () =>
      listStudentMarks({ data: { studentId: user!.id, rollNumber: myRoll, limit: 5 } }),
  });

  // Dynamic branch stats
  const activeBranchInfo = BRANCH_DATA[selectedBranch] || BRANCH_DATA["mechanical"]!;

  return (
    <AppShell
      title={`Welcome, ${displayName(profile).split(" ")[0] || "User"}`}
      description={`${DAY_NAMES[todayDow]} · ${(roles || []).map((role) => ROLE_LABELS[role] || role).join(", ") || "No role assigned"}`}
    >
      <div className="space-y-6">
        {/* Admin & Teacher Branch Selector Bar */}
        <div className="surface-card p-4 rounded-2xl border bg-gradient-to-r from-card via-card to-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Filter className="size-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Select Active Branch & Year</h3>
              <p className="text-xs text-muted-foreground">
                View branch-isolated totals and class schedules
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[200px] h-9 text-xs">
                <SelectValue placeholder="Select Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌐 All Branches</SelectItem>
                <SelectItem value="mechanical">⚙️ Mechanical Engg</SelectItem>
                <SelectItem value="computer">💻 Computer Engg</SelectItem>
                <SelectItem value="electrical">⚡ Electrical Engg</SelectItem>
                <SelectItem value="civil">🏗️ Civil Engg</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                <SelectItem value="fe">First Year (FE)</SelectItem>
                <SelectItem value="se">Second Year (SE)</SelectItem>
                <SelectItem value="te">Third Year (TE)</SelectItem>
                <SelectItem value="be">Final Year (BE)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Live Attendance Banner */}
        <section className="surface-card flex flex-wrap items-center gap-4 p-5 rounded-2xl border">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScanLine className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold">
                {isStaff ? "Live QR attendance & approvals" : "Mark & approve attendance"}
              </h2>
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 text-emerald-700 bg-emerald-50/50"
              >
                <Database className="size-3 text-emerald-600" /> Server Attendance Store
              </Badge>
              {isAppwriteConfigured() && (
                <Badge
                  variant="outline"
                  className="gap-1 border-blue-500/40 text-blue-700 bg-blue-50/50"
                >
                  <Cloud className="size-3 text-blue-600" /> Appwrite Cloud
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isStaff
                ? `Managing ${activeBranchInfo.name}. Host rotating QR sessions or scan student codes.`
                : "Scan the rotating QR code on the lecture screen, or show your personal QR code."}
            </p>
          </div>

          {isStaff ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild className="gap-2">
                <Link to="/attendance">
                  <QrCode className="size-4" /> Host session
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setScannerOpen(true)}>
                <ScanLine className="size-4" /> Scan & Approve
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => setScannerOpen(true)}>
                <ScanLine className="size-4" /> Scan QR
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setStudentQrOpen(true)}>
                <UserCheck className="size-4" /> My Approval QR
              </Button>
            </div>
          )}
        </section>

        <QrScannerDialog
          open={scannerOpen}
          onOpenChange={(open) => {
            setScannerOpen(open);
            if (!open) {
              void queryClient.invalidateQueries({ queryKey: ["my-marks", user?.id] });
            }
          }}
          audience={isStaff ? "staff" : "student"}
          title={isStaff ? "Approve Student Attendance" : "Scan attendance QR"}
          description={
            isStaff
              ? "Scan a student's personal approval QR code or enter their token code."
              : "Point your camera at the rotating QR code on the teacher's screen."
          }
        />

        <section className="surface-card space-y-3 p-5 rounded-2xl border">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">
              {isStaff ? "Sessions you have hosted" : "My attendance"}
            </h2>
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" /> From the server
            </Badge>
          </div>
          {myMarks.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : myMarks.data && myMarks.data.length > 0 ? (
            <ul className="space-y-2">
              {myMarks.data.map((mark) => (
                <li
                  key={`${mark.sessionId}-${mark.markedAt}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    {mark.subjectName ?? mark.className ?? "Session"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mark.className ?? ""} · {new Date(mark.markedAt).toLocaleString()}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {mark.source === "live_qr" ? "Verified scan" : "Teacher approved"}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {mark.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isStaff
                ? "No attendance sessions yet. Use the scan button above to approve students."
                : "Nothing recorded yet. Scan the rotating QR on the teacher's screen and tap Mark Attendance — this list updates as soon as the server stores your mark."}
            </p>
          )}
        </section>

        <Dialog open={studentQrOpen} onOpenChange={setStudentQrOpen}>
          <DialogContent className="sm:max-w-md text-center">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-center gap-2">
                <UserCheck className="size-5 text-primary" />
                My Attendance Approval QR
              </DialogTitle>
              <DialogDescription>
                Show this QR code to your teacher to get your attendance approved.
              </DialogDescription>
            </DialogHeader>
            {studentQrToken ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="rounded-2xl bg-white p-4 shadow-sm border border-border">
                  <QRCodeSVG value={studentQrToken} size={220} level="M" />
                </div>
                <div className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground max-w-xs font-mono break-all">
                  {studentQrToken}
                </div>
                <p className="text-xs text-muted-foreground">
                  {displayName(profile)} · Roll {profile?.id ? profile.id.slice(0, 8) : "N/A"}
                </p>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Branch-Specific Statistics Cards */}
        {isStaff ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <span>{activeBranchInfo.name} Totals</span>
              </h3>
              <Badge variant="secondary" className="text-xs">
                {selectedBranch.toUpperCase()} BRANCH
              </Badge>
            </div>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                icon={GraduationCap}
                label="Branch Students"
                value={activeBranchInfo.students}
                subtext={`Total in ${activeBranchInfo.name}`}
              />
              <StatCard
                icon={Users}
                label="Branch Teachers"
                value={activeBranchInfo.teachers}
                subtext={`Assigned faculty`}
              />
              <StatCard
                icon={Building2}
                label="Departments"
                value={selectedBranch === "all" ? 4 : 1}
                subtext="Active engineering dept"
              />
              <StatCard
                icon={BookOpen}
                label="Branch Subjects"
                value={activeBranchInfo.subjects}
                subtext="Curriculum subjects"
              />
              <StatCard
                icon={CalendarDays}
                label="Class Sections"
                value={activeBranchInfo.sections}
                subtext="Active lecture sections"
              />
            </section>
          </div>
        ) : null}

        {/* Today's Lectures for Active Branch */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today's Lectures ({activeBranchInfo.name})</h2>
            <Badge variant="outline">{DAY_NAMES[todayDow]}</Badge>
          </div>

          <div className="space-y-3">
            <article className="surface-card flex flex-wrap items-center gap-4 p-4 rounded-2xl border">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-base">
                  {selectedBranch === "civil"
                    ? "Structural Analysis II"
                    : selectedBranch === "computer"
                      ? "Advanced Operating Systems"
                      : selectedBranch === "electrical"
                        ? "Power Electronics & Drives"
                        : "Thermodynamics & Heat Transfer"}
                  <span className="text-muted-foreground text-xs ml-2">
                    · {selectedBranch.toUpperCase()}301
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  10:00 AM – 11:30 AM · Room A-204 · {activeBranchInfo.name}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                <QrCode className="size-3.5" />
                Live QR Active
              </Badge>
            </article>

            <article className="surface-card flex flex-wrap items-center gap-4 p-4 rounded-2xl border">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-base">
                  {selectedBranch === "civil"
                    ? "Fluid Mechanics Lab"
                    : selectedBranch === "computer"
                      ? "Database Management Systems"
                      : selectedBranch === "electrical"
                        ? "Control Systems"
                        : "Fluid Machinery Lab"}
                  <span className="text-muted-foreground text-xs ml-2">
                    · {selectedBranch.toUpperCase()}302
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  02:00 PM – 04:00 PM · Lab B-102 · {activeBranchInfo.name}
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Clock className="size-3.5" />
                Scheduled
              </Badge>
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
