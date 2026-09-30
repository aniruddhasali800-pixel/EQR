/**
 * Export and Sharing Utilities
 * Generates Excel / CSV files, Word documents, PDF Printable documents,
 * and WhatsApp / Native Social sharing with full session header information.
 */

import { uploadAttendanceReport } from "@/integrations/appwrite/service";

export type AttendanceExportRow = {
  name: string;
  roll: string;
  email: string;
  phone: string;
  subject?: string | null;
  className?: string | null;
  markedAt: string;
  status?: string | null;
};

export type SessionHeaderInfo = {
  teacherName: string;
  crName: string;
  subjectName: string;
  subjectCode?: string | undefined;
  className: string;
  startedAt: string;
  endedAt: string;
};

/**
 * Downloads attendance data as an Excel-compatible CSV file with header metadata.
 */
export function exportToExcel(
  records: AttendanceExportRow[],
  sessionName = "Attendance_Report",
  headerInfo?: SessionHeaderInfo,
) {
  if (records.length === 0) return;

  const metaRows: string[] = [];
  if (headerInfo) {
    metaRows.push(
      `"Attendance Report — Campus ERP"`,
      `""`,
      `"Teacher Name","${esc(headerInfo.teacherName)}"`,
      `"CR (Class Representative)","${esc(headerInfo.crName)}"`,
      `"Subject","${esc(headerInfo.subjectName)}${headerInfo.subjectCode ? ` (${headerInfo.subjectCode})` : ""}"`,
      `"Class / Section","${esc(headerInfo.className)}"`,
      `"Lecture Start Time","${new Date(headerInfo.startedAt).toLocaleString()}"`,
      `"Lecture End Time","${new Date(headerInfo.endedAt).toLocaleString()}"`,
      `"Total Students Present","${records.filter((r) => r.status !== "Absent").length}"`,
      `""`,
    );
  }

  const headers = [
    "#",
    "Roll Number",
    "Student Name",
    "Email ID",
    "Phone",
    "Subject",
    "Class",
    "Marked Time",
    "Status",
  ];
  const rows = records.map((r, idx) => [
    `"${idx + 1}"`,
    `"${esc(r.roll || "—")}"`,
    `"${esc(r.name || "Student")}"`,
    `"${esc(r.email || "—")}"`,
    `"${esc(r.phone || "—")}"`,
    `"${esc(r.subject || "Lecture")}"`,
    `"${esc(r.className || "Class")}"`,
    `"${formatWhen(r.markedAt)}"`,
    `"${esc(r.status || "Approved")}"`,
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8,\uFEFF" +
    [...metaRows, headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  const filename = `${sessionName}_${new Date().toISOString().slice(0, 10)}.csv`;

  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return filename;
}

function esc(val: string): string {
  return (val || "").replace(/"/g, '""');
}

/** Absent roster rows legitimately have no scan time, so never render "Invalid Date". */
function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatTimeWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

/**
 * Generates a formatted Word (.doc) document with full header block and attendance table.
 * Uses HTML-based Word document format compatible with Microsoft Word, LibreOffice, and mobile Word apps.
 */
export function generateWordReport(
  records: AttendanceExportRow[],
  headerInfo: SessionHeaderInfo,
  sessionName = "Attendance_Report",
): File | null {
  if (records.length === 0) return null;

  const startTime = new Date(headerInfo.startedAt);
  const endTime = new Date(headerInfo.endedAt);
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const rowsHtml = records
    .map(
      (r, idx) => `
      <tr>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; text-align: center; font-size: 12px;">${idx + 1}</td>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; font-size: 12px;">${r.roll || "—"}</td>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; font-weight: 600; font-size: 12px;">${r.name}</td>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; font-size: 12px;">${r.email || "—"}</td>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; font-size: 12px;">${r.phone || "—"}</td>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; font-size: 12px;">${formatTimeWhen(r.markedAt)}</td>
        <td style="padding: 6px 10px; border: 1px solid #d1d5db; color: #16a34a; font-weight: 600; font-size: 12px;">${r.status || "Present"}</td>
      </tr>
    `,
    )
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${sessionName} — Attendance Report</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page {
          size: A4;
          margin: 1cm 1.5cm;
        }
        body {
          font-family: Calibri, Arial, sans-serif;
          color: #1e293b;
          line-height: 1.5;
        }
        .header-block {
          border: 2px solid #3b82f6;
          border-radius: 8px;
          padding: 16px 20px;
          margin-bottom: 20px;
          background-color: #f0f9ff;
        }
        .header-title {
          font-size: 20px;
          font-weight: 700;
          color: #1e40af;
          text-align: center;
          margin: 0 0 12px 0;
          border-bottom: 2px solid #3b82f6;
          padding-bottom: 8px;
        }
        .header-grid {
          width: 100%;
          border-collapse: collapse;
        }
        .header-grid td {
          padding: 4px 8px;
          font-size: 13px;
          vertical-align: top;
        }
        .header-label {
          font-weight: 700;
          color: #374151;
          width: 180px;
        }
        .header-value {
          color: #1e293b;
        }
        .attendance-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        .attendance-table th {
          background-color: #eff6ff;
          padding: 8px 10px;
          border: 1px solid #93c5fd;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          color: #1e40af;
        }
        .footer-text {
          margin-top: 20px;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
          border-top: 1px solid #e5e7eb;
          padding-top: 8px;
        }
      </style>
    </head>
    <body>
      <div class="header-block">
        <p class="header-title">📋 Campus ERP — Attendance Report</p>
        <table class="header-grid">
          <tr>
            <td class="header-label">👨‍🏫 Teacher Name:</td>
            <td class="header-value">${headerInfo.teacherName}</td>
            <td class="header-label">📚 Subject:</td>
            <td class="header-value">${headerInfo.subjectName}${headerInfo.subjectCode ? ` (${headerInfo.subjectCode})` : ""}</td>
          </tr>
          <tr>
            <td class="header-label">🎓 CR (Class Rep):</td>
            <td class="header-value">${headerInfo.crName || "N/A"}</td>
            <td class="header-label">🏫 Class / Section:</td>
            <td class="header-value">${headerInfo.className}</td>
          </tr>
          <tr>
            <td class="header-label">🕐 Lecture Start:</td>
            <td class="header-value">${startTime.toLocaleString()}</td>
            <td class="header-label">🕑 Lecture End:</td>
            <td class="header-value">${endTime.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="header-label">⏱️ Duration:</td>
            <td class="header-value">${durationMin} minutes</td>
            <td class="header-label">👥 Total Present:</td>
            <td class="header-value"><strong>${records.length}</strong></td>
          </tr>
        </table>
      </div>

      <table class="attendance-table">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">#</th>
            <th>Roll No</th>
            <th>Student Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="7" style="text-align:center; padding: 16px;">No attendance records found.</td></tr>'}
        </tbody>
      </table>

      <p class="footer-text">
        Generated by Campus ERP Attendance System on ${new Date().toLocaleString()}
        <br/>
        This is a system-generated document. © Campus ERP ${new Date().getFullYear()}
      </p>
    </body>
    </html>
  `;

  const blob = new Blob([html], {
    type: "application/msword",
  });
  const filename = `${sessionName}_${new Date().toISOString().slice(0, 10)}.doc`;
  return new File([blob], filename, { type: "application/msword" });
}

/**
 * Triggers automatic download of a File object to the user's device.
 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Auto-generates both Excel and Word reports, downloads them to device,
 * uploads to Appwrite, and returns generated file references.
 */
export async function autoSaveAndShareReport(
  records: AttendanceExportRow[],
  headerInfo: SessionHeaderInfo,
  sessionId?: string,
): Promise<{
  excelFile: string | null;
  wordFile: File | null;
  appwriteExcelUrl: string | null;
  appwriteWordUrl: string | null;
}> {
  const sessionName = headerInfo.className
    ? `Attendance_${headerInfo.className.replace(/\s+/g, "_")}`
    : "Attendance_Report";

  // Generate Excel CSV
  const excelFilename = exportToExcel(records, sessionName, headerInfo);

  // Generate Word document
  const wordFile = generateWordReport(records, headerInfo, sessionName);
  if (wordFile) {
    downloadFile(wordFile);
  }

  // Upload to Appwrite (non-blocking, graceful failure)
  let appwriteExcelUrl: string | null = null;
  let appwriteWordUrl: string | null = null;

  try {
    if (wordFile) {
      appwriteWordUrl = await uploadAttendanceReport(wordFile, {
        sessionId,
        type: "word",
      });
    }

    // Create Excel file for Appwrite upload
    const excelContent = buildExcelCsvContent(records, headerInfo);
    const excelBlob = new Blob([excelContent], { type: "text/csv;charset=utf-8" });
    const excelFile = new File(
      [excelBlob],
      `${sessionName}_${new Date().toISOString().slice(0, 10)}.csv`,
      { type: "text/csv" },
    );
    appwriteExcelUrl = await uploadAttendanceReport(excelFile, {
      sessionId,
      type: "excel",
    });
  } catch (err) {
    console.warn("[Export] Appwrite upload skipped:", err);
  }

  return {
    excelFile: excelFilename ?? null,
    wordFile,
    appwriteExcelUrl,
    appwriteWordUrl,
  };
}

/**
 * Build raw CSV string content for Appwrite upload.
 */
function buildExcelCsvContent(
  records: AttendanceExportRow[],
  headerInfo?: SessionHeaderInfo,
): string {
  const lines: string[] = [];
  if (headerInfo) {
    lines.push(
      `"Attendance Report — Campus ERP"`,
      `""`,
      `"Teacher Name","${esc(headerInfo.teacherName)}"`,
      `"CR (Class Representative)","${esc(headerInfo.crName)}"`,
      `"Subject","${esc(headerInfo.subjectName)}${headerInfo.subjectCode ? ` (${headerInfo.subjectCode})` : ""}"`,
      `"Class / Section","${esc(headerInfo.className)}"`,
      `"Lecture Start Time","${new Date(headerInfo.startedAt).toLocaleString()}"`,
      `"Lecture End Time","${new Date(headerInfo.endedAt).toLocaleString()}"`,
      `"Total Students Present","${records.filter((r) => r.status !== "Absent").length}"`,
      `""`,
    );
  }

  const headers = [
    "#",
    "Roll Number",
    "Student Name",
    "Email ID",
    "Phone",
    "Subject",
    "Class",
    "Marked Time",
    "Status",
  ];
  lines.push(headers.join(","));

  records.forEach((r, idx) => {
    lines.push(
      [
        `"${idx + 1}"`,
        `"${esc(r.roll || "—")}"`,
        `"${esc(r.name || "Student")}"`,
        `"${esc(r.email || "—")}"`,
        `"${esc(r.phone || "—")}"`,
        `"${esc(r.subject || "Lecture")}"`,
        `"${esc(r.className || "Class")}"`,
        `"${formatWhen(r.markedAt)}"`,
        `"${esc(r.status || "Approved")}"`,
      ].join(","),
    );
  });

  return "\uFEFF" + lines.join("\n");
}

/**
 * Opens a clean printable report.
 *
 * Uses a hidden same-origin iframe instead of `window.open`: an installed PWA runs in a
 * standalone window with no tab strip, where popup calls are blocked and the old code simply
 * returned without ever showing the report.
 */
export function exportToPdf(
  records: AttendanceExportRow[],
  title = "Attendance Sheet",
  headerInfo?: SessionHeaderInfo,
) {
  printHtmlDocument(buildPrintDocument(records, title, headerInfo), title);
}

function buildPrintDocument(
  records: AttendanceExportRow[],
  title: string,
  headerInfo?: SessionHeaderInfo,
): string {
  const headerBlock = headerInfo
    ? `
      <div style="border: 2px solid #3b82f6; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; background: #f0f9ff;">
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr>
            <td style="padding: 3px 6px; font-weight: 700; color: #374151; width: 160px;">👨‍🏫 Teacher Name:</td>
            <td style="padding: 3px 6px;">${headerInfo.teacherName}</td>
            <td style="padding: 3px 6px; font-weight: 700; color: #374151; width: 160px;">📚 Subject:</td>
            <td style="padding: 3px 6px;">${headerInfo.subjectName}${headerInfo.subjectCode ? ` (${headerInfo.subjectCode})` : ""}</td>
          </tr>
          <tr>
            <td style="padding: 3px 6px; font-weight: 700; color: #374151;">🎓 CR (Class Rep):</td>
            <td style="padding: 3px 6px;">${headerInfo.crName || "N/A"}</td>
            <td style="padding: 3px 6px; font-weight: 700; color: #374151;">🏫 Class / Section:</td>
            <td style="padding: 3px 6px;">${headerInfo.className}</td>
          </tr>
          <tr>
            <td style="padding: 3px 6px; font-weight: 700; color: #374151;">🕐 Start Time:</td>
            <td style="padding: 3px 6px;">${new Date(headerInfo.startedAt).toLocaleString()}</td>
            <td style="padding: 3px 6px; font-weight: 700; color: #374151;">🕑 End Time:</td>
            <td style="padding: 3px 6px;">${new Date(headerInfo.endedAt).toLocaleString()}</td>
          </tr>
        </table>
      </div>
    `
    : "";

  const rowsHtml = records
    .map(
      (r, idx) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.roll || "—"}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${r.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.email || "—"}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.phone || "—"}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${formatTimeWhen(r.markedAt)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; color: #16a34a; font-weight: 600;">${r.status || "Approved"}</td>
      </tr>
    `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} — Campus ERP</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #1e293b; }
          .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
          .header h1 { margin: 0; font-size: 24px; color: #0f172a; }
          .header p { margin: 4px 0 0 0; font-size: 14px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th { background: #f8fafc; padding: 10px 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Campus ERP — Attendance Report</h1>
          <p>${title} · Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          <p>Present: <strong>${records.filter((r) => (r.status || "Approved") !== "Absent").length}</strong> ·
             Absent: <strong>${records.filter((r) => r.status === "Absent").length}</strong> ·
             Total on sheet: <strong>${records.length}</strong></p>
        </div>
        ${headerBlock}
        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">#</th>
              <th>Roll No</th>
              <th>Student Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="text-align:center; padding: 16px;">No attendance records found.</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `;

  return html;
}

/**
 * Renders a report inside a hidden same-origin iframe and prints it. Popup blockers cannot
 * stop this, and the document is fully written before `print()` is called, unlike the old
 * `document.write`-into-a-popup approach that raced the load event.
 */
export function printHtmlDocument(html: string, title: string): void {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };

  const doc = frame.contentDocument;
  if (!doc) {
    remove();
    downloadHtmlFallback(html, title);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = frame.contentWindow;
  const print = () => {
    try {
      win?.focus();
      win?.print();
    } catch (err) {
      console.warn("[export] iframe print failed, offering the report as a file:", err);
      downloadHtmlFallback(html, title);
    }
    // Chrome/Firefox keep the print dialog async; give it room before tearing the frame down.
    window.setTimeout(remove, 60_000);
  };
  win?.addEventListener("afterprint", () => window.setTimeout(remove, 500));

  if (doc.readyState === "complete") window.setTimeout(print, 120);
  else frame.onload = () => window.setTimeout(print, 120);
}

function downloadHtmlFallback(html: string, title: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const safe = title.replace(/[^\w.-]+/g, "_").slice(0, 60) || "Attendance_Report";
  downloadFile(
    new File([blob], `${safe}_${new Date().toISOString().slice(0, 10)}.html`, {
      type: "text/html",
    }),
  );
}

/**
 * Shares attendance summary directly to WhatsApp or native Web Share API.
 * Includes full session header information.
 */
export async function shareAttendance(
  records: AttendanceExportRow[],
  title = "Attendance Summary",
  headerInfo?: SessionHeaderInfo,
) {
  let headerText = "";
  if (headerInfo) {
    headerText =
      `👨‍🏫 *Teacher:* ${headerInfo.teacherName}\n` +
      `🎓 *CR:* ${headerInfo.crName || "N/A"}\n` +
      `📚 *Subject:* ${headerInfo.subjectName}${headerInfo.subjectCode ? ` (${headerInfo.subjectCode})` : ""}\n` +
      `🏫 *Class:* ${headerInfo.className}\n` +
      `🕐 *Start:* ${new Date(headerInfo.startedAt).toLocaleString()}\n` +
      `🕑 *End:* ${new Date(headerInfo.endedAt).toLocaleString()}\n\n`;
  }

  const textSummary =
    `📋 *Campus ERP ${title}*\n📅 Date: ${new Date().toLocaleDateString()}\n👥 Total Present: ${records.length}\n\n` +
    headerText +
    `━━━━━━━━━━━━━━━━━━━\n` +
    records
      .slice(0, 20)
      .map((r, i) => `${i + 1}. *${r.name}* (${r.roll || "—"}) — ${formatTimeWhen(r.markedAt)}`)
      .join("\n") +
    (records.length > 20 ? `\n...and ${records.length - 20} more.` : "") +
    `\n━━━━━━━━━━━━━━━━━━━\n_Generated by Campus ERP_`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: `Campus ERP ${title}`,
        text: textSummary,
      });
      return;
    } catch {
      // Fallback to WhatsApp URL
    }
  }

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textSummary)}`;
  window.open(whatsappUrl, "_blank");
}
