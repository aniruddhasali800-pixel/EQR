import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useAuth, type AppRole } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/directory")({
  head: () => ({
    meta: [
      { title: "Directory — Campus ERP" },
      {
        name: "description",
        content: "Search students and staff, review assigned roles and manage role assignments.",
      },
      { property: "og:title", content: "Directory — Campus ERP" },
      {
        property: "og:description",
        content: "Campus people directory with role management for administrators.",
      },
    ],
  }),
  component: DirectoryPage,
});

const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

function DirectoryPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("super_admin");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const people = useQuery({
    queryKey: ["directory"],
    queryFn: async () => {
      const [profiles, roleRows] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone, department_id")
          .order("first_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roleRows.error) throw roleRows.error;

      const rolesByUser = new Map<string, AppRole[]>();
      for (const row of roleRows.data ?? []) {
        const list = rolesByUser.get(row.user_id) ?? [];
        list.push(row.role as AppRole);
        rolesByUser.set(row.user_id, list);
      }
      return (profiles.data ?? []).map((profile) => ({
        ...profile,
        roles: rolesByUser.get(profile.id) ?? [],
      }));
    },
  });

  const setPrimaryRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error: deleteError } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Role updated");
      await queryClient.invalidateQueries({ queryKey: ["directory"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (people.data ?? []).filter((person) => {
      const matchesRole = roleFilter === "all" || person.roles.includes(roleFilter as AppRole);
      if (!matchesRole) return false;
      if (!term) return true;
      return `${person.first_name} ${person.last_name} ${person.email}`.toLowerCase().includes(term);
    });
  }, [people.data, search, roleFilter]);

  return (
    <AppShell title="Directory" description="Students and staff across the campus">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="pl-9"
              maxLength={80}
              aria-label="Search people"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="sm:w-56" aria-label="Filter by role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ALL_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {people.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-card p-10 text-center text-sm text-muted-foreground">
            No people match your filters.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((person) => (
              <li key={person.id} className="surface-card flex flex-wrap items-center gap-4 p-4">
                <Avatar className="size-10">
                  <AvatarFallback className="text-xs">
                    {`${person.first_name?.[0] ?? ""}${person.last_name?.[0] ?? ""}`.toUpperCase() ||
                      "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {person.first_name} {person.last_name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{person.email}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {person.roles.length > 0 ? (
                    person.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {ROLE_LABELS[role]}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">No role</Badge>
                  )}
                </div>
                {isAdmin ? (
                  <Select
                    value={person.roles[0] ?? ""}
                    onValueChange={(role) =>
                      setPrimaryRole.mutate({ userId: person.id, role: role as AppRole })
                    }
                  >
                    <SelectTrigger className="w-44" aria-label={`Set role for ${person.email}`}>
                      <SelectValue placeholder="Assign role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
