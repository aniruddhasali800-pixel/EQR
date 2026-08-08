import { createFileRoute, Link } from "@tanstack/react-router";
import {
  QrCode,
  ShieldCheck,
  CalendarClock,
  FileSpreadsheet,
  Smartphone,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import appIcon from "@/assets/app-icon.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campus ERP — College ERP & Smart QR Attendance" },
      {
        name: "description",
        content:
          "Installable college ERP with secure rotating QR attendance, timetables, role dashboards and automatic PDF/Excel reports.",
      },
      { property: "og:title", content: "Campus ERP — College ERP & Smart QR Attendance" },
      {
        property: "og:description",
        content:
          "Installable college ERP with secure rotating QR attendance, timetables, role dashboards and automatic PDF/Excel reports.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: QrCode,
    title: "Rotating secure QR",
    body: "Server-generated, encrypted, time-limited codes that expire in 30–60 seconds and can't be reused.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    body: "Super Admin, Principal, HOD, Teacher, CR and Student each get scoped data and permissions.",
  },
  {
    icon: CalendarClock,
    title: "Timetable driven",
    body: "Lecture sessions come straight from the timetable — teacher, student, room and department views.",
  },
  {
    icon: FileSpreadsheet,
    title: "Automatic reports",
    body: "Attendance summaries ready to export, editable for 24 hours, then locked automatically.",
  },
  {
    icon: Smartphone,
    title: "Installable everywhere",
    body: "One codebase for Android, iPhone, tablet, Windows and macOS — install to the home screen.",
  },
  {
    icon: Users,
    title: "Whole campus",
    body: "Departments, subjects, sections, students and faculty managed in a single system.",
  },
];

function Landing() {
  const { session, loading } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="gradient-hero text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <img
              src={appIcon}
              alt="Campus ERP logo"
              width={1024}
              height={1024}
              className="size-9 rounded-lg"
            />
            <span className="font-display text-base font-semibold">Campus ERP</span>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/auth">{!loading && session ? "Open app" : "Sign in"}</Link>
          </Button>
        </div>

        <div className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:pb-28 sm:pt-16">
          <p className="text-sm font-medium uppercase tracking-widest text-primary-foreground/70">
            College ERP &amp; Smart Attendance
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight sm:text-6xl">
            Attendance that can't be <span className="text-gradient-accent">faked</span>.
          </h1>
          <p className="mt-5 max-w-xl text-base text-primary-foreground/80 sm:text-lg">
            Timetables, students, faculty and departments in one installable app. Teachers start a
            lecture, a rotating QR appears, and the server does the verifying.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">{!loading && session ? "Go to dashboard" : "Get started"}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="border border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold sm:text-3xl">Built for the whole campus</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Phase one ships authentication, roles, the full data model and timetable management. QR
          attendance, reports and analytics build on top of it.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="surface-card p-5">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
        Campus ERP — install it from your browser menu for a full-screen app experience.
      </footer>
    </div>
  );
}
