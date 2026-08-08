import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  GraduationCap,
  Building2,
  BookOpen,
  CalendarDays,
  Clock,
  QrCode,
  ScanLine,
  UserCheck,
  HardDrive,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { QrScannerDialog } from "@/components/QrScannerDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, displayName, useAuth } from "@/lib/auth";
import { buildStudentToken } from "@/lib/qr-token";
import { DAY_NAMES, formatTime } from "@/lib/timetable";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Campus ERP" },
      {
        name: "description",
        content: "Your Campus ERP dashboard: today's lectures, campus totals and role permissions.",
      },
      { property: "og:title", content: "Dashboard — Campus ERP" },
      { property: "og:description", content: "Today's lectures and campus overview in Campus ERP." },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  loading?: boolean;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      )}
    </div>
  );
}

function Dashboard() {
  const { profile, roles, isStaff, user } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [studentQrOpen, setStudentQrOpen] = useState(false);
  const todayDow = new Date().getDay();

  const studentQrToken = user?.id ? buildStudentToken(user.id) : "";

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    enabled: isStaff,
    queryFn: async () => {
      const [students, teachers, departments, subjects, sections] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("class_sections").select("id", { count: "exact", head: true }),
      ]);
      return {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        departments: departments.count ?? 0,
        subjects: subjects.count ?? 0,
        sections: sections.count ?? 0,
      };
    },
  });

  const today = useQuery({
    queryKey: ["today-slots", todayDow, user?.id],
    queryFn: async () => {
      let query = supabase
        .from("timetable_slots")
        .select(
          "id, start_time, end_time, room, day_of_week, subjects(name, code), class_sections(name, semester, section)",
        )
        .eq("day_of_week", todayDow)
        .order("start_time");
      if (roles.includes("teacher") && user?.id) query = query.eq("teacher_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title={`Welcome, ${displayName(profile).split(" ")[0]}`}
      description={`${DAY_NAMES[todayDow]} · ${roles.map((role) => ROLE_LABELS[role]).join(", ") || "No role assigned"}`}
    >
      <div className="space-y-8">
        <section className="surface-card flex flex-wrap items-center gap-4 p-5">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScanLine className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold">
                {isStaff ? "Live QR attendance & approvals" : "Mark & approve attendance"}
              </h2>
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 bg-emerald-50/50">
                <HardDrive className="size-3 text-emerald-600" /> Local Storage Ready
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {isStaff
                ? "Start a session and project a QR code, or scan student QR codes to approve attendance."
                : "Point your camera at the lecture QR code, or show your personal QR code to your teacher."}
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
          onOpenChange={setScannerOpen}
          title={isStaff ? "Approve Student Attendance" : "Scan attendance QR"}
          description={
            isStaff
              ? "Scan a student's personal approval QR code or enter their token code."
              : "Point your camera at the rotating QR code on the teacher's screen."
          }
        />

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
                  {displayName(profile)} · Roll {profile?.id.slice(0, 8)}
                </p>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {isStaff ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={GraduationCap}
              label="Students"
              value={stats.data?.students ?? 0}
              loading={stats.isLoading}
            />
            <StatCard
              icon={Users}
              label="Teachers"
              value={stats.data?.teachers ?? 0}
              loading={stats.isLoading}
            />
            <StatCard
              icon={Building2}
              label="Departments"
              value={stats.data?.departments ?? 0}
              loading={stats.isLoading}
            />
            <StatCard
              icon={BookOpen}
              label="Subjects"
              value={stats.data?.subjects ?? 0}
              loading={stats.isLoading}
            />
            <StatCard
              icon={CalendarDays}
              label="Class sections"
              value={stats.data?.sections ?? 0}
              loading={stats.isLoading}
            />
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today's lectures</h2>
            <Badge variant="outline">{DAY_NAMES[todayDow]}</Badge>
          </div>

          <div className="mt-4 space-y-3">
            {today.isLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : today.data && today.data.length > 0 ? (
              today.data.map((slot) => (
                <article
                  key={slot.id}
                  className="surface-card flex flex-wrap items-center gap-4 p-4"
                >
                  <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {slot.subjects?.name ?? "Unassigned subject"}
                      {slot.subjects?.code ? (
                        <span className="text-muted-foreground"> · {slot.subjects.code}</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      {slot.room ? ` · Room ${slot.room}` : ""}
                      {slot.class_sections
                        ? ` · ${slot.class_sections.name} (Sem ${slot.class_sections.semester}${slot.class_sections.section})`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <QrCode className="size-3.5" />
                    QR attendance
                  </Badge>
                </article>
              ))
            ) : (
              <div className="surface-card p-8 text-center text-sm text-muted-foreground">
                No lectures scheduled for today.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

