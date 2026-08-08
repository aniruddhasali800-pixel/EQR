export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEK_DAYS = [1, 2, 3, 4, 5, 6] as const;

/** Formats a Postgres `time` value (HH:MM:SS) as a readable 12-hour time. */
export function formatTime(value: string | null | undefined) {
  if (!value) return "--";
  const [hourPart, minutePart] = value.split(":");
  const hour = Number(hourPart);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minutePart ?? "00"} ${suffix}`;
}

export type TimetableCsvRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  subject_code: string | null;
  teacher_email: string | null;
  section_name: string;
};

/**
 * Parses a timetable CSV. Expected header:
 * section,day,start,end,room,subject_code,teacher_email
 * `day` accepts a weekday name or 0-6.
 */
export function parseTimetableCsv(text: string): { rows: TimetableCsvRow[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errors: string[] = [];
  const rows: TimetableCsvRow[] = [];
  if (lines.length < 2) return { rows, errors: ["The file has no data rows."] };

  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index]!.split(",").map((cell) => cell.trim());
    const [section, day, start, end, room, subjectCode, teacherEmail] = cells;
    if (!section || !day || !start || !end) {
      errors.push(`Row ${index + 1}: section, day, start and end are required.`);
      continue;
    }
    const numericDay = Number(day);
    const dayIndex = Number.isNaN(numericDay)
      ? DAY_NAMES.findIndex((name) => name.toLowerCase() === day.toLowerCase())
      : numericDay;
    if (dayIndex < 0 || dayIndex > 6) {
      errors.push(`Row ${index + 1}: "${day}" is not a valid day.`);
      continue;
    }
    rows.push({
      section_name: section,
      day_of_week: dayIndex,
      start_time: start.length === 5 ? `${start}:00` : start,
      end_time: end.length === 5 ? `${end}:00` : end,
      room: room || null,
      subject_code: subjectCode || null,
      teacher_email: teacherEmail || null,
    });
  }

  return { rows, errors };
}
