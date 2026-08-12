import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Building2,
  LogOut,
  Menu,
  GraduationCap,
  QrCode,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS, displayName, useAuth, type AppRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[];
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/timetable", label: "Timetable", icon: CalendarDays },
  {
    to: "/attendance",
    label: "Live QR attendance",
    icon: QrCode,
    roles: ["super_admin", "principal", "hod", "teacher"],
  },
  {
    to: "/directory",
    label: "Directory",
    icon: Users,
    roles: ["super_admin", "principal", "hod", "teacher"],
  },
  { to: "/admin", label: "Administration", icon: Building2, roles: ["super_admin"] },
  { to: "/settings", label: "Profile & Settings", icon: User },
];

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { hasAnyRole } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => !item.roles || hasAnyRole(item.roles)).map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { profile, roles, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col bg-sidebar p-4">
      <div className="flex items-center gap-2 px-2 pb-6 pt-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="size-5" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-sidebar-foreground">Campus ERP</p>
          <p className="text-[11px] text-sidebar-foreground/60">Smart Attendance</p>
        </div>
      </div>

      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-3 px-1">
          <Avatar className="size-9">
            <AvatarImage src={profile?.photo_url || ""} />
            <AvatarFallback className="bg-sidebar-accent text-xs text-sidebar-accent-foreground">
              {displayName(profile).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>


          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {displayName(profile)}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">
              {(roles || []).map((role) => ROLE_LABELS[role] || role).join(", ") || "No role"}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { roles } = useAuth();

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarBody />
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/85 px-4 py-3 backdrop-blur lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none p-0">
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
            {description ? (
              <p className="hidden truncate text-sm text-muted-foreground sm:block">{description}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {roles && roles[0] ? (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {ROLE_LABELS[roles[0]] || roles[0]}
              </Badge>
            ) : null}

            {actions}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
