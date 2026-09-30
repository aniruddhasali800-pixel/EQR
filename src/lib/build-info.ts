/**
 * The commit the running bundle was built from, baked in by vite.config.ts. Deliberately its own
 * dependency-free module: the server functions import it too, and must not pull browser-only
 * modules (toast, service-worker plumbing) into the server bundle just to read a string.
 */
declare const __APP_BUILD__: string | undefined;

export const APP_BUILD_ID = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "";
