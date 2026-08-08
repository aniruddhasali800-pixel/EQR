import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DAY_NAMES, WEEK_DAYS, formatTime, parseTimetableCsv } from "@/lib/timetable";

export const Route = createFileRoute("/_authenticated/timetable")({
  head: () => ({
    meta: [
      { title: "Timetable — Campus ERP" },
      {
        name: "description",
        content:
          "Weekly class timetable by section, subject, teacher and room. Admins can add slots or import a CSV.",
      },
      { property: "og:title", content: "Timetable — Campus ERP" },
      {
        property: "og:description",
        content: "Weekly timetable management for sections, subjects, teachers and rooms.",
      },
    ],
  }),
  component: TimetablePage,
});

type SlotRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  class_section_id: string;
  teacher_id: string | null;
  subjects: { name: string; code: string } | null;
  class_sections: { name: string; semester: number; section: string } | null;
};

function TimetablePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("super_admin");
  const queryClient = useQueryClient();
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const sections = useQuery({
    queryKey: ["class-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sections")
        .select("id, name, semester, section")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name, code").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const slots = useQuery({
    queryKey: ["timetable-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .select(
          "id, day_of_week, start_time, end_time, room, class_section_id, teacher_id, subjects(name, code), class_sections(name, semester, section)",
        )
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as SlotRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = slots.data ?? [];
    return sectionFilter === "all"
      ? rows
      : rows.filter((slot) => slot.class_section_id === sectionFilter);
  }, [slots.data, sectionFilter]);

  const createSlot = useMutation({
    mutationFn: async (form: FormData) => {
      const classSectionId = String(form.get("class_section_id") ?? "");
      const subjectId = String(form.get("subject_id") ?? "");
      const dayOfWeek = Number(form.get("day_of_week"));
      const startTime = String(form.get("start_time") ?? "");
      const endTime = String(form.get("end_time") ?? "");
      if (!classSectionId || !startTime || !endTime) throw new Error("Fill in all required fields");
      if (endTime <= startTime) throw new Error("End time must be after the start time");

      const { error } = await supabase.from("timetable_slots").insert({
        class_section_id: classSectionId,
        subject_id: subjectId || null,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        room: String(form.get("room") ?? "").trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Timetable slot added");
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Slot removed");
      await queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const { rows, errors } = parseTimetableCsv(await file.text());
      if (rows.length === 0) throw new Error(errors[0] ?? "Nothing to import");

      const sectionMap = new Map((sections.data ?? []).map((row) => [row.name.toLowerCase(), row.id]));
      const subjectMap = new Map(
        (subjects.data ?? []).map((row) => [row.code.toLowerCase(), row.id]),
      );

      const payload = rows
        .map((row) => {
          const sectionId = sectionMap.get(row.section_name.toLowerCase());
          if (!sectionId) return null;
          return {
            class_section_id: sectionId,
            subject_id: row.subject_code
              ? (subjectMap.get(row.subject_code.toLowerCase()) ?? null)
              : null,
            day_of_week: row.day_of_week,
            start_time: row.start_time,
            end_time: row.end_time,
            room: row.room,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (payload.length === 0) throw new Error("No rows matched an existing class section");
      const { error } = await supabase.from("timetable_slots").insert(payload);
      if (error) throw error;
      return { imported: payload.length, skipped: rows.length - payload.length, errors };
    },
    onSuccess: async (result) => {
      toast.success(
        `Imported ${result.imported} slot(s)${result.skipped ? `, skipped ${result.skipped}` : ""}`,
      );
      setImportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Timetable"
      description="Weekly schedule by section, subject, teacher and room"
      actions={
        isAdmin ? (
          <div className="flex gap-2">
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Upload className="size-4" />
                  <span className="hidden sm:inline">Import CSV</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import timetable</DialogTitle>
                  <DialogDescription>
                    CSV header: section,day,start,end,room,subject_code,teacher_email. Times use
                    24-hour HH:MM.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importCsv.mutate(file);
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Add slot</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    createSlot.mutate(new FormData(event.currentTarget));
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Add timetable slot</DialogTitle>
                    <DialogDescription>
                      Lecture sessions and QR attendance are generated from these slots.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="class_section_id">Class section</Label>
                      <Select name="class_section_id" required>
                        <SelectTrigger id="class_section_id">
                          <SelectValue placeholder="Select a section" />
                        </SelectTrigger>
                        <SelectContent>
                          {(sections.data ?? []).map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.name} · Sem {section.semester}
                              {section.section}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="subject_id">Subject</Label>
                      <Select name="subject_id">
                        <SelectTrigger id="subject_id">
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {(subjects.data ?? []).map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.name} ({subject.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="day_of_week">Day</Label>
                      <Select name="day_of_week" defaultValue="1">
                        <SelectTrigger id="day_of_week">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_DAYS.map((day) => (
                            <SelectItem key={day} value={String(day)}>
                              {DAY_NAMES[day]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="start_time">Start</Label>
                        <Input id="start_time" name="start_time" type="time" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="end_time">End</Label>
                        <Input id="end_time" name="end_time" type="time" required />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="room">Room</Label>
                      <Input id="room" name="room" maxLength={40} placeholder="A-204" />
                    </div>
                  </div>

                  <DialogFooter className="mt-6">
                    <Button type="submit" disabled={createSlot.isPending}>
                      Add slot
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="max-w-xs">
          <Label htmlFor="section-filter" className="text-xs text-muted-foreground">
            Filter by section
          </Label>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger id="section-filter" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {(sections.data ?? []).map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name} · Sem {section.semester}
                  {section.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {slots.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-card p-10 text-center text-sm text-muted-foreground">
            No timetable slots yet.
            {isAdmin ? " Add one or import a CSV to get started." : ""}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {WEEK_DAYS.map((day) => {
              const daySlots = filtered.filter((slot) => slot.day_of_week === day);
              if (daySlots.length === 0) return null;
              return (
                <section key={day} className="surface-card p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold">{DAY_NAMES[day]}</h2>
                    <Badge variant="outline">{daySlots.length}</Badge>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {daySlots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {slot.subjects?.name ?? "Unassigned subject"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                            {slot.room ? ` · ${slot.room}` : ""}
                          </p>
                          {slot.class_sections ? (
                            <p className="text-xs text-muted-foreground">
                              {slot.class_sections.name} · Sem {slot.class_sections.semester}
                              {slot.class_sections.section}
                            </p>
                          ) : null}
                        </div>
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete slot"
                            onClick={() => deleteSlot.mutate(slot.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
