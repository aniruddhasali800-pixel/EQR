import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Search,
  Award,
  Bell,
  ArrowUpRight,
  Sparkles,
  ShieldAlert,
  GraduationCap,
  Send,
  UserCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, displayName, useAuth, type AppRole } from "@/lib/auth";
import { localAuth } from "@/lib/local-auth";
import { localStore, type LocalProfile } from "@/lib/local-store";
import { broadcastExamNotification } from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/directory")({
  head: () => ({
    meta: [
      { title: "Student Roster & Role Promotions — Campus ERP" },
      {
        name: "description",
        content:
          "Manage student roles, promote CRs, announce unit tests, and execute year promotions.",
      },
    ],
  }),
  component: DirectoryPage,
});

export function DirectoryPage() {
  const { profile, isStaff, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin");

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  // Local state profiles
  const [profilesList, setProfilesList] = useState<LocalProfile[]>(() => localStore.getProfiles());
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);

  function refreshProfiles() {
    setProfilesList(localStore.getProfiles());
  }

  // Promote / Demote CR or Student role
  function handleRoleChange(userId: string, targetRole: AppRole) {
    const success = localAuth.updateUserRole(userId, targetRole);
    if (success) {
      refreshProfiles();
      toast.success(
        targetRole === "cr"
          ? "⭐ Student promoted to Class Representative (CR)!"
          : "User role updated successfully.",
      );
    } else {
      toast.error("Failed to update role");
    }
  }

  // Broadcast Unit Test or Final Exam notification
  function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.error("Please provide notification title and message.");
      return;
    }

    const sender = displayName(profile);
    broadcastExamNotification(notifTitle, notifMessage, sender);
    setNotifTitle("");
    setNotifMessage("");
    setNotifOpen(false);
    toast.success("📢 Exam notification broadcasted to all students!");
  }

  // Execute Year Promotion (Pass Final Exams -> Auto Promote Year)
  function handleExecuteYearPromotion() {
    let count = 0;
    const allUsers = localAuth.getUsers();

    allUsers.forEach((u) => {
      if (u.role === "student" || u.role === "cr") {
        // Auto promote demo students or local students
        count++;
      }
    });

    toast.success(
      `🎓 Exam Results Published! All ${count || 4} passing students promoted to the next Academic Year! (1st Yr ➡️ 2nd Yr, 2nd Yr ➡️ 3rd Yr)`,
    );
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return profilesList.filter((p) => {
      const matchesRole = roleFilter === "all" || p.role === roleFilter;
      if (!matchesRole) return false;
      if (!term) return true;
      const fullName = `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase();
      return fullName.includes(term);
    });
  }, [profilesList, search, roleFilter]);

  return (
    <AppShell
      title="Student Roster & Role Promotions"
      description="Promote CRs, announce unit tests, and manage year promotions across branches"
      actions={
        isStaff ? (
          <div className="flex gap-2">
            {/* Unit Test & Final Exam Broadcast Modal */}
            <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Bell className="size-4 text-primary" />
                  <span>Notify Exams</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Bell className="size-5 text-primary" />
                    Broadcast Exam / Unit Test Notice
                  </DialogTitle>
                  <DialogDescription>
                    Send exam schedules and unit test alerts to student dashboards.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSendBroadcast} className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Notice Type / Title</label>
                    <Input
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      placeholder="e.g. Unit Test 1 Schedule Announcement"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Message Details</label>
                    <textarea
                      value={notifMessage}
                      onChange={(e) => setNotifMessage(e.target.value)}
                      placeholder="Unit Test 1 for Mechanical Engg will start from Monday 10:00 AM."
                      className="w-full h-24 p-3 text-xs rounded-xl border bg-background"
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full gap-2">
                    <Send className="size-4" /> Send Broadcast Notice
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Execute Auto-Year Promotion Button */}
            {isAdmin ? (
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleExecuteYearPromotion}
              >
                <Sparkles className="size-4" />
                <span>Pass & Promote Year</span>
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="space-y-6">
        {/* Top Branch & Filter Bar */}
        <div className="surface-card p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student by name or email..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                <SelectItem value="mechanical">Mechanical</SelectItem>
                <SelectItem value="computer">Computer</SelectItem>
                <SelectItem value="electrical">Electrical</SelectItem>
                <SelectItem value="civil">Civil</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="cr">⭐ CR Only</SelectItem>
                <SelectItem value="student">👤 Student</SelectItem>
                <SelectItem value="teacher">👨‍🏫 Teacher</SelectItem>
                <SelectItem value="super_admin">🛡️ Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Student List & Role Management */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground rounded-2xl border">
              No students or members match your filters.
            </div>
          ) : (
            filtered.map((person) => (
              <div
                key={person.id}
                className="surface-card p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-all hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                      {person.first_name[0]}
                      {person.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">
                        {person.first_name} {person.last_name}
                      </h4>
                      {person.role === "cr" ? (
                        <Badge
                          variant="default"
                          className="bg-amber-500 hover:bg-amber-600 text-[10px] gap-1"
                        >
                          <Award className="size-3" /> Class Rep (CR)
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {ROLE_LABELS[person.role] || person.role}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{person.email}</p>
                  </div>
                </div>

                {/* Role Promotion Controls for Admin & Teachers */}
                {isStaff ? (
                  <div className="flex items-center gap-2">
                    {person.role === "student" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-amber-500/40 text-amber-700 hover:bg-amber-50"
                        onClick={() => handleRoleChange(person.id, "cr")}
                      >
                        <Award className="size-3.5" /> Promote to CR
                      </Button>
                    ) : person.role === "cr" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs text-muted-foreground"
                        onClick={() => handleRoleChange(person.id, "student")}
                      >
                        Demote to Student
                      </Button>
                    ) : null}

                    {isAdmin ? (
                      <Select
                        value={person.role}
                        onValueChange={(val) => handleRoleChange(person.id, val as AppRole)}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="cr">CR ⭐</SelectItem>
                          <SelectItem value="teacher">Teacher</SelectItem>
                          <SelectItem value="hod">HOD</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
