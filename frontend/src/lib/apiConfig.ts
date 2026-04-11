/**
 * Dynamic API URL resolution.
 *
 * - On localhost → http://localhost:8020  (and ws://localhost:8020)
 * - On a domain  → https://api_julyai.najrudin.com.np  (and wss://...)
 *
 * We use "api_" prefix (underscore) instead of "api." (dot) because
 * Cloudflare free SSL only covers *.najrudin.com.np, not *.julyai.najrudin.com.np.
 *
 * Works on both server-side (SSR) and client-side.
 */

/** Build the API hostname from the frontend hostname.
 *  julyai.najrudin.com.np → api_julyai.najrudin.com.np */
function toApiHostname(hostname: string): string {
  return `api_${hostname}`;
}

/** HTTP(S) base URL for the backend API. */
export function getApiBase(): string {
  // Server-side (SSR / Node) — no window available
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8020";
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol; // "http:" or "https:"

  // Local dev mode → backend on port 8020
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:8020`;
  }

  // Production domain → api_julyai.najrudin.com.np
  return `${protocol}//${toApiHostname(hostname)}`;
}

/** WebSocket base URL for the backend. */
export function getWsBase(): string {
  // Server-side fallback
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8020";
  }

  const hostname = window.location.hostname;
  const isSecure = window.location.protocol === "https:";
  const wsProtocol = isSecure ? "wss:" : "ws:";

  // Local dev mode
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${wsProtocol}//${hostname}:8020`;
  }

  // Production domain
  return `${wsProtocol}//${toApiHostname(hostname)}`;
}
