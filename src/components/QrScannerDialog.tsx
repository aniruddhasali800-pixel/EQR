import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  ScanLine,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markAttendance } from "@/lib/attendance.functions";
import { announceAttendanceUpdate } from "@/lib/attendance-events";
import type { MarkOutcome } from "@/lib/attendance-types";
import { useAuth } from "@/lib/auth";
import { localStore } from "@/lib/local-store";

type Status = "idle" | "scanning" | "review" | "done" | "error";

export function QrScannerDialog({
  open,
  onOpenChange,
  sessionId,
  audience = "student",
  title = "Scan attendance QR",
  description = "Point your camera at the live attendance QR code or student approval QR code.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string | undefined;
  /** `staff` scans student codes to approve them; `student` scans the projected lecture QR. */
  audience?: "student" | "staff";
  title?: string;
  description?: string;
}) {
  const { user, profile } = useAuth();
  const containerId = "campus-erp-qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isScanningRef = useRef(false);
  // The camera callback keeps firing between a decode and the stream stopping, and it closes
  // over a stale `status`, so an explicit ref guards against double-marking a single scan.
  const flowRef = useRef(false);

  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualToken, setManualToken] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<MarkOutcome | null>(null);

  // The student's own identity, taken from the signed-in account and their saved details.
  const self = useMemo(() => {
    const detail = localStore.getStudentDetails().find((d) => d.user_id === user?.id);
    const name = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") : "";
    return {
      id: user?.id ?? "",
      name,
      rollNumber: detail?.roll_number ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  }, [user?.id, profile]);

  async function stopCamera() {
    const active = scannerRef.current;
    if (!active || !isScanningRef.current) return;
    try {
      await active.stop();
    } catch {
      // Already stopped or never attached a stream — nothing to clean up.
    }
    isScanningRef.current = false;
  }

  /** A decode only *prepares* the mark; the student confirms it, so a stray QR cannot mark them. */
  function captureToken(decoded: string) {
    if (flowRef.current) return;
    flowRef.current = true;
    void stopCamera();
    setScanned(decoded.trim());
    setMessage(null);
    setOutcome(null);
    setStatus("review");
  }

  async function submitMark() {
    if (!scanned || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await markAttendance({
        data: {
          token: scanned,
          sessionId,
          student: self,
          source: audience === "staff" ? "teacher_scan" : "live_qr",
        },
      });
      setOutcome(result);
      if (result.ok) {
        setStatus("done");
        announceAttendanceUpdate(result.record.sessionId);
        toast.success(
          result.alreadyMarked
            ? `Already marked at ${new Date(result.record.markedAt).toLocaleTimeString()}`
            : "Attendance saved on the server",
          {
            description: `${result.record.studentName} · ${result.totalPresent} present in this session`,
          },
        );
      } else {
        setMessage(result.reason);
        toast.error(result.reason);
      }
    } catch (error) {
      console.error("[scanner] mark attendance failed:", error);
      setMessage(
        error instanceof Error && error.message
          ? `Server rejected the mark: ${error.message}`
          : "Could not reach the attendance server. Check the connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open || mode !== "camera") return;
    let cancelled = false;

    setStatus("scanning");
    setMessage(null);
    setOutcome(null);
    setScanned(null);
    flowRef.current = false;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startScanner = async () => {
      let attempts = 0;
      while (!document.getElementById(containerId)) {
        if (cancelled || attempts > 20) return;
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }
      if (cancelled) return;

      try {
        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;
        isStartingRef.current = true;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!cancelled) captureToken(decoded);
          },
          () => undefined,
        );

        isStartingRef.current = false;
        isScanningRef.current = true;
      } catch (error) {
        if (cancelled) return;
        isStartingRef.current = false;
        isScanningRef.current = false;
        setMessage(
          error instanceof Error
            ? `Camera unavailable: ${error.message}`
            : "Camera permission is required to scan the QR code.",
        );
        setStatus("error");
      }
    };

    timeoutId = setTimeout(() => void startScanner(), 100);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);

      const active = scannerRef.current;
      scannerRef.current = null;
      if (active) {
        const stopAndClear = async () => {
          if (isStartingRef.current) await new Promise((r) => setTimeout(r, 300));
          if (isScanningRef.current) {
            try {
              await active.stop();
            } catch {
              // Ignore
            }
          }
          try {
            active.clear();
          } catch {
            // Ignore
          }
          isScanningRef.current = false;
          isStartingRef.current = false;
        };
        void stopAndClear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, retryCount, sessionId, user?.id]);

  function resetScanner() {
    flowRef.current = false;
    setManualToken("");
    setScanned(null);
    setOutcome(null);
    setMessage(null);
    setStatus(mode === "camera" ? "scanning" : "idle");
    setRetryCount((prev) => prev + 1);
  }

  const marked = outcome?.ok ? outcome.record : null;
  const reMarked = outcome?.ok === true && outcome.alreadyMarked;
  const presentTotal = outcome?.ok === true ? outcome.totalPresent : null;
  const primaryLabel = audience === "staff" ? "Approve Attendance" : "Mark Attendance";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {status === "done" && marked ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Saved on the server</p>
                <p className="text-xs text-emerald-700">
                  {reMarked
                    ? "This student was already marked for this session."
                    : `${marked.studentName} is on the attendance sheet.`}
                </p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Student" value={marked.studentName} />
              <Row label="Roll number" value={marked.rollNumber ?? "—"} />
              <Row label="Status" value={marked.status} />
              <Row label="Marked at" value={new Date(marked.markedAt).toLocaleTimeString()} />
              <Row label="Present total" value={String(presentTotal ?? 1)} />
            </dl>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={resetScanner}>
                <RefreshCw className="size-4" /> Scan another
              </Button>
              <Button
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : status === "review" && scanned ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {audience === "staff" ? "Ready to approve" : "Ready to mark attendance"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {audience === "staff"
                  ? "Confirm to record this code against the live session."
                  : `${self.name || "You"}${self.rollNumber ? ` · Roll ${self.rollNumber}` : ""}`}
              </p>
              <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                {summarise(scanned)}
              </p>
            </div>
            {message ? (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetScanner}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={() => void submitMark()}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {submitting ? "Saving…" : primaryLabel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex rounded-lg bg-muted p-1 text-xs">
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                  mode === "camera"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setMode("camera");
                  resetScanner();
                }}
              >
                Camera Scanner
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                  mode === "manual"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setMode("manual");
                  resetScanner();
                }}
              >
                Manual Entry
              </button>
            </div>

            {mode === "camera" ? (
              <div className="space-y-3">
                <div
                  id={containerId}
                  className="min-h-[240px] overflow-hidden rounded-xl border border-border bg-muted [&_video]:w-full"
                />
                {status === "scanning" ? (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ScanLine className="size-4 text-primary" /> Point the camera at the QR code…
                  </p>
                ) : null}
                {status === "error" && message ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>{message}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={resetScanner}
                    >
                      <RefreshCw className="size-4" /> Try again
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualToken.trim()) captureToken(manualToken);
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="manual-qr-token"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Roll number, QR payload or barcode
                  </label>
                  <Input
                    id="manual-qr-token"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="e.g. CS-2024-001, or CERP1|… from the screen"
                    disabled={submitting}
                  />
                  {audience === "student" ? (
                    <p className="text-[11px] text-muted-foreground">
                      Students should scan the live QR. Manual entry marks you as approved by the
                      teacher rather than by a verified scan.
                    </p>
                  ) : null}
                </div>
                {status === "error" && message ? (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <XCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{message}</span>
                  </div>
                ) : null}
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={!manualToken.trim() || submitting}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {submitting ? "Saving…" : primaryLabel}
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function summarise(token: string): string {
  const parts = token.split("|");
  if (parts[0] === "CERP1" && parts.length === 4) {
    return `Lecture QR for session ${parts[1]?.slice(0, 8)}… issued at ${new Date(
      Number(parts[2]) * 1000,
    ).toLocaleTimeString()}`;
  }
  if (parts[0] === "CERP_STUDENT" && parts.length === 2) {
    return `Student code ${parts[1]?.slice(0, 12)}…`;
  }
  return `Code: ${token.slice(0, 60)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
