import { describe, it, expect } from "vitest";
import { toCalStamp, googleCalendarUrl, buildIcs, icsDataUrl } from "@/lib/calendar-links";

const start = new Date(Date.UTC(2026, 5, 20, 18, 30, 0)); // 2026-06-20 18:30:00 UTC
const end = new Date(Date.UTC(2026, 5, 20, 21, 30, 0));

describe("toCalStamp", () => {
  it("formats a UTC basic timestamp", () => {
    expect(toCalStamp(start)).toBe("20260620T183000Z");
  });
  it("zero-pads months, days and times", () => {
    expect(toCalStamp(new Date(Date.UTC(2026, 0, 5, 4, 7, 9)))).toBe("20260105T040709Z");
  });
});

describe("googleCalendarUrl", () => {
  const url = googleCalendarUrl({ title: "GTA RP", start, end, details: "twitch" });
  it("is a Google Calendar template link", () => {
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
  });
  it("carries the weekly recurrence + the start/end window", () => {
    expect(decodeURIComponent(url)).toContain("RRULE:FREQ=WEEKLY");
    expect(decodeURIComponent(url)).toContain("20260620T183000Z/20260620T213000Z");
  });
  it("url-encodes the title", () => {
    expect(googleCalendarUrl({ title: "Just Chatting & chill", start, end })).toContain("Just+Chatting+%26+chill");
  });
});

describe("buildIcs", () => {
  const ics = buildIcs({ uid: "slot-1@ghost", title: "Movie; night, vibes", start, end, details: "kick" });
  it("is a well-formed weekly-recurring VEVENT", () => {
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("RRULE:FREQ=WEEKLY");
    expect(ics).toContain("DTSTART:20260620T183000Z");
    expect(ics).toContain("DTEND:20260620T213000Z");
    expect(ics).toContain("END:VCALENDAR");
  });
  it("escapes commas and semicolons in text per RFC 5545", () => {
    expect(ics).toContain("SUMMARY:Movie\\; night\\, vibes");
  });
  it("uses CRLF line endings", () => {
    expect(ics).toContain("\r\n");
  });
});

describe("icsDataUrl", () => {
  it("wraps the ics in a downloadable data URL", () => {
    expect(icsDataUrl("BEGIN:VCALENDAR")).toBe("data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR");
  });
});
