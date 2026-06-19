// src/lib/api-client.ts
// Tiny shared API client for client components. Centralizes the fetch + JSON +
// error-extraction pattern repeated across ~100 call sites. Throws ApiError with
// the server's `error` message (the shape every API route in this app returns),
// so callers can `catch (e)` and show `e.message` directly in a toast.
export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown = null) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[] | null;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("connection", 0);
  }
  let body: Json = null;
  try { body = await res.json(); } catch { /* empty/non-JSON body */ }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

/** GET returning parsed JSON (no-store by default — UI data should be fresh). */
export function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  return request<T>(url, { cache: "no-store", ...init });
}

/** POST with a JSON payload, returning parsed JSON. */
export function apiPost<T>(url: string, payload?: unknown, init?: RequestInit): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    ...init,
  });
}

/**
 * POST for sensitive admin actions that may require a 2FA step-up. If the server
 * replies with `stepUpRequired`, prompt for a current TOTP code and retry once.
 * When the admin hasn't enabled 2FA the server never asks, so this is identical to
 * apiPost. A cancelled prompt re-throws the original 401. (Native prompt is in
 * keeping with the admin panel's existing confirm() dialogs.)
 */
export async function apiPostStepUp<T>(url: string, payload?: Record<string, unknown>): Promise<T> {
  try {
    return await apiPost<T>(url, payload);
  } catch (e) {
    const needsStepUp =
      e instanceof ApiError &&
      e.body != null &&
      typeof e.body === "object" &&
      (e.body as { stepUpRequired?: unknown }).stepUpRequired === true;
    if (!needsStepUp) throw e;
    const code = typeof window !== "undefined" ? window.prompt("Kod 2FA (6 cyfr):")?.replace(/\s/g, "") : null;
    if (!code) throw e; // cancelled → surface the original error
    return await apiPost<T>(url, { ...(payload ?? {}), totpCode: code });
  }
}

/** PATCH with a JSON payload, returning parsed JSON. */
export function apiPatch<T>(url: string, payload?: unknown, init?: RequestInit): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    ...init,
  });
}
