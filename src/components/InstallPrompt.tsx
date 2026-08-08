import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "campus-erp-install-dismissed";

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !promptEvent) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md sm:inset-x-auto sm:right-4">
      <div className="surface-card flex items-center gap-3 p-3 shadow-raised">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Campus ERP</p>
          <p className="text-xs text-muted-foreground">
            Add it to your home screen for an app-like experience.
          </p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            setVisible(false);
          }}
        >
          Install
        </Button>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
