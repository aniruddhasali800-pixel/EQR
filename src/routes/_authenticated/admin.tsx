import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, BookOpen, Users2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Campus ERP" },
      {
        name: "description",
        content: "Create departments, subjects and class sections that power timetables and attendance.",
      },
      { property: "og:title", content: "Administration — Campus ERP" },
      {
        property: "og:description",
        content: "Manage departments, subjects and class sections in Campus ERP.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("super_admin");
  const queryClient = useQueryClient();

  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useQuery({
    queryKey: ["subjects-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, code, semester, departments(name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sections = useQuery({
    queryKey: ["sections-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sections")
        .select("id, name, semester, section, departments(name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createDepartment = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      const code = String(form.get("code") ?? "").trim().toUpperCase();
      if (!name || !code) throw new Error("Name and code are required");
      const { error } = await supabase.from("departments").insert({ name, code });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Department created");
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createSubject = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      const code = String(form.get("code") ?? "").trim().toUpperCase();
      const departmentId = String(form.get("department_id") ?? "");
      const semester = Number(form.get("semester"));
      if (!name || !code || !departmentId) throw new Error("Name, code and department are required");
      const { error } = await supabase.from("subjects").insert({
        name,
        code,
        department_id: departmentId,
        semester: Number.isNaN(semester) ? 1 : semester,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Subject created");
      await queryClient.invalidateQueries({ queryKey: ["subjects-admin"] });
      await queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createSection = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      const section = String(form.get("section") ?? "").trim().toUpperCase();
      const departmentId = String(form.get("department_id") ?? "");
      const semester = Number(form.get("semester"));
      if (!name || !section || !departmentId) throw new Error("All fields are required");
      const { error } = await supabase.from("class_sections").insert({
        name,
        section,
        department_id: departmentId,
        semester: Number.isNaN(semester) ? 1 : semester,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Class section created");
      await queryClient.invalidateQueries({ queryKey: ["sections-admin"] });
      await queryClient.invalidateQueries({ queryKey: ["class-sections"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="Administration">
        <div className="surface-card p-10 text-center text-sm text-muted-foreground">
          Only a Super Admin can manage campus structure.
        </div>
      </AppShell>
    );
  }

  const departmentOptions = departments.data ?? [];

  return (
    <AppShell
      title="Administration"
      description="Departments, subjects and class sections power timetables and attendance"
    >
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">
            <Building2 className="size-4" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="subjects">
            <BookOpen className="size-4" />
            Subjects
          </TabsTrigger>
          <TabsTrigger value="sections">
            <Users2 className="size-4" />
            Sections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
          <form
            className="surface-card space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              createDepartment.mutate(form);
              event.currentTarget.reset();
            }}
          >
            <h2 className="font-display font-semibold">New department</h2>
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input id="dept-name" name="name" required maxLength={80} placeholder="Computer Science" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-code">Code</Label>
              <Input id="dept-code" name="code" required maxLength={10} placeholder="CSE" />
            </div>
            <Button type="submit" className="w-full" disabled={createDepartment.isPending}>
              Create department
            </Button>
          </form>

          <div className="space-y-3">
            {departments.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : departmentOptions.length === 0 ? (
              <div className="surface-card p-10 text-center text-sm text-muted-foreground">
                No departments yet.
              </div>
            ) : (
              departmentOptions.map((department) => (
                <div
                  key={department.id}
                  className="surface-card flex items-center justify-between p-4"
                >
                  <p className="font-medium">{department.name}</p>
                  <Badge variant="secondary">{department.code}</Badge>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="subjects" className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
          <form
            className="surface-card space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              createSubject.mutate(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <h2 className="font-display font-semibold">New subject</h2>
            <div className="space-y-1.5">
              <Label htmlFor="subject-name">Name</Label>
              <Input id="subject-name" name="name" required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-code">Code</Label>
              <Input id="subject-code" name="code" required maxLength={20} placeholder="CS301" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-dept">Department</Label>
              <Select name="department_id" required>
                <SelectTrigger id="subject-dept">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-semester">Semester</Label>
              <Input
                id="subject-semester"
                name="semester"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={createSubject.isPending}>
              Create subject
            </Button>
          </form>

          <div className="space-y-3">
            {subjects.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (subjects.data ?? []).length === 0 ? (
              <div className="surface-card p-10 text-center text-sm text-muted-foreground">
                No subjects yet.
              </div>
            ) : (
              (subjects.data ?? []).map((subject) => (
                <div key={subject.id} className="surface-card flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{subject.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {subject.departments?.name ?? "—"} · Semester {subject.semester}
                    </p>
                  </div>
                  <Badge variant="secondary">{subject.code}</Badge>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sections" className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
          <form
            className="surface-card space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              createSection.mutate(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <h2 className="font-display font-semibold">New class section</h2>
            <div className="space-y-1.5">
              <Label htmlFor="section-name">Name</Label>
              <Input id="section-name" name="name" required maxLength={80} placeholder="CSE 2026" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="section-dept">Department</Label>
              <Select name="department_id" required>
                <SelectTrigger id="section-dept">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="section-semester">Semester</Label>
                <Input
                  id="section-semester"
                  name="semester"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={1}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="section-letter">Section</Label>
                <Input id="section-letter" name="section" required maxLength={4} placeholder="A" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createSection.isPending}>
              Create section
            </Button>
          </form>

          <div className="space-y-3">
            {sections.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (sections.data ?? []).length === 0 ? (
              <div className="surface-card p-10 text-center text-sm text-muted-foreground">
                No class sections yet.
              </div>
            ) : (
              (sections.data ?? []).map((section) => (
                <div key={section.id} className="surface-card flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{section.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {section.departments?.name ?? "—"}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    Sem {section.semester}
                    {section.section}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
