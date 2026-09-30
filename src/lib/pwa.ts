/**
 * Guarded service-worker registration.
 * Never registers in dev, iframes, or Lovable preview hosts — those contexts
 * must always fetch fresh HTML. `?sw=off` acts as a kill switch.
 */
import { toast } from "sonner";
import { APP_BUILD_ID } from "@/lib/build-info";

const SW_URL = "/sw.js";
const RELOAD_KEY = "cerp-sw-reload-at";
const BUILD_RELOAD_KEY = "cerp-build-reload-to";
const RELOAD_COOLDOWN_MS = 60_000;
const UPDATE_POLL_MS = 5 * 60_000;

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;

  const host = window.location.hostname;
  const blockedHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  if (blockedHost) return true;

  return new URLSearchParams(window.location.search).has("sw")
    ? new URLSearchParams(window.location.search).get("sw") === "off"
    : false;
}

async function unregisterAppServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) =>
        (registration.active?.scriptURL ?? registration.installing?.scriptURL ?? "").endsWith(
          SW_URL,
        ),
      )
      .map((registration) => registration.unregister()),
  );
}

/**
 * A tab opened before a deploy keeps running the bundle it loaded. On the teacher's projector
 * that means minting QR codes the new server can never accept, so once a newer worker takes
 * control the page reloads itself. Only reloads when the page was already under control — a
 * first visit has no stale bundle to replace.
 */
function reloadWhenUpdated(registration: ServiceWorkerRegistration): void {
  if (!navigator.serviceWorker.controller) return;

  let done = false;
  const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (done) return;
    done = true;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    toast.info("Updated to the newest version of the app", {
      description: "This screen is reloading.",
    });
    window.location.reload();
  });

  // An open tab never navigates, so the browser would only re-check sw.js on its own schedule.
  const pollId = window.setInterval(() => {
    void registration.update().catch(() => undefined);
  }, UPDATE_POLL_MS);
  window.addEventListener("pagehide", () => window.clearInterval(pollId), { once: true });
}

/**
 * Compare this bundle's build with the one the server is running. A host that cannot serve
 * /sw.js has no worker to update an open tab, so the teacher's projector would sit on an old
 * build indefinitely and keep minting QR codes no student can use.
 *
 * Returns "reloading" when it has started a reload, "stuck" when a reload already ran and the
 * server is still handing out the older bundle (a cache in front of the app, not something the
 * page can fix by reloading again), and "current" otherwise.
 */
export function reconcileBuild(serverBuildId: string): "current" | "reloading" | "stuck" {
  if (typeof window === "undefined") return "current";
  if (!APP_BUILD_ID || !serverBuildId || serverBuildId === "unknown") return "current";
  if (serverBuildId === APP_BUILD_ID) return "current";
  if (sessionStorage.getItem(BUILD_RELOAD_KEY) === serverBuildId) return "stuck";

  sessionStorage.setItem(BUILD_RELOAD_KEY, serverBuildId);
  toast.info("This screen is on an older build — reloading it now.", {
    description: `The server is running ${serverBuildId.slice(0, 7)}.`,
  });
  window.location.reload();
  return "reloading";
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    void unregisterAppServiceWorkers();
    return;
  }

  void navigator.serviceWorker
    .register(SW_URL, { scope: "/" })
    .then((registration) => reloadWhenUpdated(registration))
    .catch(() => {
      // Registration failures must never break the app.
    });
}
