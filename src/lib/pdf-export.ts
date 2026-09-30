/**
 * Attendance PDF generation.
 *
 * Produces a real .pdf file rather than the print-window path that phones and installed-PWA
 * windows silently blocked. jsPDF lays out A4 portrait; every rostered student appears, marked
 * Present (with scan time) or Absent.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportRow } from "./attendance-types";
import { downloadFile, type SessionHeaderInfo } from "./export-utils";

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const BRAND: [number, number, number] = [42, 47, 168];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function durationLabel(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

export type PdfResult = { filename: string; blob: Blob; pageCount: number };

/** Lays out the report and hands back the PDF blob plus the file name it should use. */
export function buildAttendancePdf(
  rows: ReportRow[],
  header: SessionHeaderInfo,
  sessionName = "Attendance_Report",
): PdfResult {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  const presentCount = rows.filter((row) => row.status === "Present").length;
  const absentCount = rows.length - presentCount;
  const rate = rows.length > 0 ? Math.round((presentCount / rows.length) * 100) : 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND);
  doc.text("Campus ERP — Attendance Report", pageWidth / 2, 52, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    `${sessionName} · Generated ${formatDateTime(new Date().toISOString())}`,
    pageWidth / 2,
    68,
    { align: "center" },
  );

  autoTable(doc, {
    startY: 82,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [203, 213, 225] },
    body: [
      [
        { content: "Teacher", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        header.teacherName || "—",
        { content: "Subject", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        `${header.subjectName}${header.subjectCode ? ` (${header.subjectCode})` : ""}`,
      ],
      [
        { content: "Class / Section", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        header.className || "—",
        { content: "CR", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        header.crName || "N/A",
      ],
      [
        { content: "Session start", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        formatDateTime(header.startedAt),
        { content: "Session end", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        formatDateTime(header.endedAt),
      ],
      [
        { content: "Duration", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        durationLabel(header.startedAt, header.endedAt),
        { content: "Attendance", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
        `${presentCount} present · ${absentCount} absent · ${rate}% of ${rows.length} enrolled`,
      ],
    ],
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 175 },
      2: { cellWidth: 80 },
      3: { cellWidth: "auto" },
    },
  });

  const tableStart = getFinalY(doc) + 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Student attendance sheet", margin, tableStart);

  autoTable(doc, {
    startY: tableStart + 10,
    head: [["#", "Roll No", "Student Name", "Email", "Phone", "Marked At", "Status"]],
    body: rows.map((row, index) => [
      String(index + 1),
      row.roll,
      row.name,
      row.email,
      row.phone,
      row.status === "Present" ? formatTime(row.markedAt) : "—",
      row.status,
    ]),
    styles: { fontSize: 8.5, cellPadding: 4, textColor: INK, lineColor: [203, 213, 225] },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: 62 },
      5: { cellWidth: 60, halign: "center" },
      6: { cellWidth: 52, halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 6) return;
      const present = data.cell.raw === "Present";
      data.cell.styles.textColor = present ? [22, 163, 74] : [220, 38, 38];
      data.cell.styles.fillColor = present ? [240, 253, 244] : [254, 242, 242];
    },
    didDrawPage: () => {
      const height = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      const page = doc.getNumberOfPages();
      doc.text(`Campus ERP — page ${page}`, margin, height - 24);
      doc.text(`${presentCount} of ${rows.length} present`, pageWidth - margin, height - 24, {
        align: "right",
      });
    },
  });

  // Signature lines so the sheet can be printed and signed by the teacher and CR.
  const finalY = getFinalY(doc) + 40;
  const height = doc.internal.pageSize.getHeight();
  const y = finalY < height - 70 ? finalY : height - 70;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, margin + 170, y);
  doc.line(pageWidth - margin - 170, y, pageWidth - margin, y);
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Signature of Teacher", margin, y + 12);
  doc.text("Signature of Class Representative", pageWidth - margin - 170, y + 12);

  const blob = doc.output("blob") as Blob;
  const filename = `${sanitize(sessionName)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { filename, blob, pageCount: doc.getNumberOfPages() };
}

function getFinalY(doc: jsPDF): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return last?.finalY ?? 120;
}

/** Saves the PDF straight to the device — the only path that works in an installed PWA. */
export function saveAttendancePdf(
  rows: ReportRow[],
  header: SessionHeaderInfo,
  sessionName = "Attendance_Report",
): PdfResult {
  const result = buildAttendancePdf(rows, header, sessionName);
  downloadFile(new File([result.blob], result.filename, { type: "application/pdf" }));
  return result;
}

/**
 * Opens the PDF in a viewer tab. Installed-PWA windows block new tabs, so the file is saved
 * instead of the user getting nothing, which is exactly how the old print window failed.
 */
export function openAttendancePdf(
  rows: ReportRow[],
  header: SessionHeaderInfo,
  sessionName = "Attendance_Report",
): PdfResult {
  const result = buildAttendancePdf(rows, header, sessionName);
  const url = URL.createObjectURL(result.blob);
  const viewer = window.open(url, "_blank");
  if (!viewer) {
    downloadFile(new File([result.blob], result.filename, { type: "application/pdf" }));
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return result;
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "Attendance_Report";
}
