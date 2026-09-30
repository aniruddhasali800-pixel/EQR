/**
 * Cross-tab attendance signalling.
 *
 * A scan on another device reaches the teacher's list through the server poll; this channel is
 * what makes tabs on the *same* device (e.g. the dashboard scanner next to the hosting page)
 * update the moment a mark lands, instead of waiting for the next poll tick.
 */

const CHANNEL = "cerp_attendance";

export function announceAttendanceUpdate(sessionId: string): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  new BroadcastChannel(CHANNEL).postMessage({ sessionId, at: Date.now() });
}

/** Subscribes to scan updates. Returns the unsubscribe function for a useEffect. */
export function onAttendanceUpdate(handler: (sessionId: string) => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<{ sessionId?: string }>) => {
    if (typeof event.data?.sessionId === "string") handler(event.data.sessionId);
  };
  return () => channel.close();
}
