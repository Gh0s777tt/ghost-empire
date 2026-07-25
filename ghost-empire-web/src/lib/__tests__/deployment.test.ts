// QA: deployment classification (src/lib/deployment.ts) — the gate that decides whether the
// money-in crons run and page a human. Two invariants matter, and they pull in opposite directions:
//   1. a Vercel preview/dev build must NOT poll donations or fire the "income stalled" alert
//      (false alarms on a money rail desensitise the operator to the real one);
//   2. anything we can't positively identify as preview/dev — above all a self-hosted portal with
//      no VERCEL_ENV — MUST still count as production, or the gate silently kills real polling.
// Pure logic, env injected, no DB/network (repo convention).
import { describe, it, expect } from "vitest";
import { deploymentEnv, isProductionDeployment } from "@/lib/deployment";

describe("deploymentEnv / isProductionDeployment", () => {
  it("classifies an explicit Vercel production deployment as production", () => {
    expect(deploymentEnv({ VERCEL_ENV: "production" })).toBe("production");
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("classifies a preview deployment as non-production (the false-alert source)", () => {
    expect(deploymentEnv({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
  });

  it("classifies a Vercel development deployment as non-production", () => {
    expect(deploymentEnv({ VERCEL_ENV: "development" })).toBe("development");
    expect(isProductionDeployment({ VERCEL_ENV: "development" })).toBe(false);
  });

  it("FAILS OPEN when VERCEL_ENV is absent — a self-hosted portal keeps polling", () => {
    // The regression this guards: gating on `=== "production"` alone would classify every
    // non-Vercel deployment (Docker, VPS, another PaaS) as non-production and stop donation
    // ingestion there — a silent money-in outage introduced by an alerting fix.
    expect(deploymentEnv({})).toBe("production");
    expect(isProductionDeployment({})).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: undefined })).toBe(true);
  });

  it("FAILS OPEN on an unrecognised value rather than silencing the rail", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "staging" })).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: "" })).toBe(true);
  });

  it("is case- and whitespace-insensitive on the platform value", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "Preview" })).toBe(false);
    expect(isProductionDeployment({ VERCEL_ENV: " preview " })).toBe(false);
    expect(isProductionDeployment({ VERCEL_ENV: "PRODUCTION" })).toBe(true);
  });
});
