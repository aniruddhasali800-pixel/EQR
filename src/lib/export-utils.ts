/**
 * Export and Sharing Utilities
 * Generates Excel / CSV files, PDF Printable documents, and WhatsApp / Native Social sharing.
 */

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

/**
 * Downloads attendance data as an Excel-compatible CSV file.
 */
export function exportToExcel(records: AttendanceExportRow[], sessionName = "Attendance_Report") {
  if (records.length === 0) return;

  const headers = ["Roll Number", "Student Name", "Email ID", "Phone", "Subject", "Class", "Marked Time", "Status"];
  const rows = records.map((r) => [
    `"${(r.roll || "—").replace(/"/g, '""')}"`,
    `"${(r.name || "Student").replace(/"/g, '""')}"`,
    `"${(r.email || "—").replace(/"/g, '""')}"`,
    `"${(r.phone || "—").replace(/"/g, '""')}"`,
    `"${(r.subject || "Lecture").replace(/"/g, '""')}"`,
    `"${(r.className || "Class").replace(/"/g, '""')}"`,
    `"${new Date(r.markedAt).toLocaleString()}"`,
    `"${(r.status || "Approved").replace(/"/g, '""')}"`,
  ]);

  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  const filename = `${sessionName}_${new Date().toISOString().slice(0, 10)}.csv`;

  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Opens a clean printable PDF report window.
 */
export function exportToPdf(records: AttendanceExportRow[], title = "Attendance Sheet") {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const rowsHtml = records
    .map(
      (r, idx) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.roll || "—"}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${r.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.email || "—"}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.phone || "—"}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(r.markedAt).toLocaleTimeString()}</td>
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
          <p>Total Present Students: <strong>${records.length}</strong></p>
        </div>
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
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Shares attendance summary directly to WhatsApp or native Web Share API.
 */
export async function shareAttendance(records: AttendanceExportRow[], title = "Attendance Summary") {
  const textSummary = `📋 *Campus ERP ${title}*\n📅 Date: ${new Date().toLocaleDateString()}\n👥 Total Present: ${records.length}\n\n` +
    records
      .slice(0, 15)
      .map((r, i) => `${i + 1}. *${r.name}* (${r.roll || "—"}) - ${new Date(r.markedAt).toLocaleTimeString()}`)
      .join("\n") +
    (records.length > 15 ? `\n...and ${records.length - 15} more.` : "");

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
