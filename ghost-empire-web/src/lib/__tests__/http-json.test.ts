// QA: defensive JSON parsing of third-party responses (src/lib/http.ts).
// The bug this locks down: `res.json()` on an HTML body throws the platform's own
// `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, which named neither the upstream
// nor the status nor the content-type — so when it reached the donation cron's Sentry alert
// (GHOST-EMPIRE-WEB-5) it was unreadable on a money-in rail. Two invariants:
//   1. anything that parses today STILL parses (this must not change what production accepts);
//   2. anything that doesn't produces a message naming upstream + status + content-type.
// Pure logic, no DB/network (repo convention).
import { describe, it, expect } from "vitest";
import { parseJsonBody, jsonOrThrow } from "@/lib/http";

const HTML_LOGIN_PAGE =
  '<!DOCTYPE html><html><head><title>Sign in</title></head><body>Authentication Required</body></html>';

describe("parseJsonBody — success path is unchanged", () => {
  it("parses a normal JSON body", () => {
    const out = parseJsonBody<{ data: number[] }>({
      label: "Streamlabs donations",
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: '{"data":[1,2]}',
    });
    expect(out).toEqual({ data: [1, 2] });
  });

  it("still parses valid JSON served under a sloppy content-type", () => {
    // Parse-first, diagnose-second: content-type never rejects a body that parses, so an upstream
    // that works today can't start failing because of this change.
    const out = parseJsonBody({ label: "x", status: 200, contentType: "text/plain", body: '{"ok":true}' });
    expect(out).toEqual({ ok: true });
  });
});

describe("parseJsonBody — diagnosable failures", () => {
  it("names upstream, status and content-type for an HTML body on a 200", () => {
    // The exact production signature: expired/revoked OAuth token → login page under HTTP 200.
    let message = "";
    try {
      parseJsonBody({
        label: "Streamlabs donations",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: HTML_LOGIN_PAGE,
      });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("Streamlabs donations");
    expect(message).toContain("HTTP 200");
    expect(message).toContain("text/html");
    expect(message).toContain("HTML page");
    // The old, useless message must no longer be what the operator sees.
    expect(message).not.toMatch(/^Unexpected token/);
  });

  it("caps the echoed body so a full HTML document can't flood the alert", () => {
    const message = grabMessage(() =>
      parseJsonBody({ label: "x", status: 502, contentType: "text/html", body: "<html>" + "a".repeat(5_000) }),
    );
    expect(message.length).toBeLessThan(400);
    expect(message).toContain("HTTP 502");
  });

  it("reports an empty body as empty rather than as a parse error", () => {
    const message = grabMessage(() =>
      parseJsonBody({ label: "Streamlabs donations", status: 204, contentType: null, body: "" }),
    );
    expect(message).toContain("empty body");
    expect(message).toContain("content-type (none)");
  });

  it("reports truncated/garbage JSON with its snippet", () => {
    const message = grabMessage(() =>
      parseJsonBody({ label: "Streamlabs donations", status: 200, contentType: "application/json", body: '{"data":[' }),
    );
    expect(message).toContain("application/json");
    expect(message).toContain('{"data":[');
    expect(message).not.toContain("HTML page");
  });
});

describe("jsonOrThrow — same contract over a Response", () => {
  it("returns the parsed body of a JSON response", async () => {
    const res = new Response('{"data":[]}', { headers: { "content-type": "application/json" } });
    await expect(jsonOrThrow(res, "Streamlabs donations")).resolves.toEqual({ data: [] });
  });

  it("throws the diagnosable error for an HTML response", async () => {
    const res = new Response(HTML_LOGIN_PAGE, { status: 200, headers: { "content-type": "text/html" } });
    await expect(jsonOrThrow(res, "Streamlabs donations")).rejects.toThrow(
      /Streamlabs donations returned non-JSON \(HTTP 200, content-type text\/html\)/,
    );
  });
});

/** Run `fn`, expect it to throw, and hand back the message (keeps the assertions readable). */
function grabMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("expected the call to throw, but it returned");
}
