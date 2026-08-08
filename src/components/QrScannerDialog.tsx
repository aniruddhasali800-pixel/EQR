import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { CheckCircle2, KeyRound, Loader2, RefreshCw, ScanLine, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markAttendanceByToken, type MarkResult } from "@/lib/attendance.functions";

export function QrScannerDialog({
  open,
  onOpenChange,
  sessionId,
  title = "Scan attendance QR",
  description = "Point your camera at the live attendance QR code or student approval QR code.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  title?: string;
  description?: string;
}) {
  const mark = useServerFn(markAttendanceByToken);
  const containerId = "campus-erp-qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isScanningRef = useRef(false);
  const busyRef = useRef(false);

  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualToken, setManualToken] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "scanning" | "submitting" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<MarkResult | null>(null);

  async function processToken(decodedToken: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("submitting");
    setMessage(null);

    // Stop scanner if active
    const active = scannerRef.current;
    if (active && isScanningRef.current) {
      try {
        await active.stop();
        isScanningRef.current = false;
      } catch {
        // Ignore stop errors
      }
    }

    try {
      const data = await mark({ data: { token: decodedToken.trim(), sessionId } });
      setResult(data);
      setStatus("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process QR approval.");
      setStatus("error");
      busyRef.current = false;
    }
  }

  useEffect(() => {
    if (!open || mode !== "camera") return;
    let cancelled = false;

    setStatus("scanning");
    setMessage(null);
    setResult(null);
    busyRef.current = false;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startScanner = async () => {
      // Wait for DOM element to be mounted in dialog
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
            if (!cancelled) void processToken(decoded);
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
          if (isStartingRef.current) {
            await new Promise((r) => setTimeout(r, 300));
          }
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
  }, [open, mode, retryCount, mark, sessionId]);

  function resetScanner() {
    setManualToken("");
    setResult(null);
    setMessage(null);
    setStatus("idle");
    busyRef.current = false;
    setRetryCount((prev) => prev + 1);
  }

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

        {status === "done" && result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-primary">
              <CheckCircle2 className="size-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {result.alreadyMarked
                    ? "Attendance already approved & recorded"
                    : "Attendance approved & recorded"}
                </p>
                {result.approvedBy ? (
                  <p className="text-xs text-primary/80">Approved via {result.approvedBy}</p>
                ) : null}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Student Name" value={result.student.name} />
              <Row label="Roll number" value={result.student.rollNumber ?? "—"} />
              <Row label="Email" value={result.student.email ?? "—"} />
              <Row label="Phone" value={result.student.phone ?? "—"} />
              <Row label="Subject" value={result.session.subject ?? "—"} />
              <Row label="Class" value={result.session.className ?? "—"} />
              <Row label="Approved at" value={new Date(result.markedAt).toLocaleTimeString()} />
            </dl>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={resetScanner}>
                <RefreshCw className="size-4" /> Scan another
              </Button>
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                Done
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
                Manual Code Entry
              </button>
            </div>

            {mode === "camera" ? (
              <div className="space-y-3">
                <div
                  id={containerId}
                  className="min-h-[240px] overflow-hidden rounded-xl border border-border bg-muted [&_video]:w-full"
                />
                {status === "submitting" ? (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Verifying approval…
                  </p>
                ) : null}
                {status === "error" && message ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <XCircle className="mt-0.5 size-4 shrink-0" />
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
                  if (manualToken.trim()) void processToken(manualToken);
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <label htmlFor="manual-qr-token" className="text-xs font-medium text-muted-foreground">
                    QR Token string or payload
                  </label>
                  <Input
                    id="manual-qr-token"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="e.g. CERP1|... or CERP_STUDENT|..."
                    disabled={status === "submitting"}
                  />
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
                  disabled={!manualToken.trim() || status === "submitting"}
                >
                  {status === "submitting" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  Approve Attendance
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

