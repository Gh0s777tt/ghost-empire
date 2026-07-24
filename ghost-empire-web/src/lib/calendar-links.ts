// src/lib/calendar-links.ts
// Pure builders for "add to calendar" from a recurring weekly stream slot (#536):
// a Google Calendar template URL and a downloadable .ics, both with a weekly
// recurrence rule. Inputs are absolute Dates (the schedule UI computes the next
// occurrence in the viewer's local time); we emit UTC stamps so the calendar event
// lands at exactly the moment the on-page countdown points to.

const pad = (n: number): string => n.toString().padStart(2, "0");

/** Format a Date as an iCal/Google UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function toCalStamp(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export type CalEvent = { title: string; start: Date; end: Date; details?: string };

/** Google Calendar "template" URL for a weekly-recurring event. */
export function googleCalendarUrl(e: CalEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${toCalStamp(e.start)}/${toCalStamp(e.end)}`,
    recur: "RRULE:FREQ=WEEKLY",
  });
  if (e.details) params.set("details", e.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape per RFC 5545 text rules (backslash, semicolon, comma, newline). */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Minimal VCALENDAR with one weekly-recurring VEVENT. */
export function buildIcs(e: CalEvent & { uid: string }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // PRODID names the generating platform (E-Forge), not any single tenant — a
    // downloaded .ics served from a white-label portal must not carry the founder brand.
    "PRODID:-//E-Forge//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${toCalStamp(e.start)}`,
    `DTSTART:${toCalStamp(e.start)}`,
    `DTEND:${toCalStamp(e.end)}`,
    "RRULE:FREQ=WEEKLY",
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.details ? [`DESCRIPTION:${icsEscape(e.details)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** A data: URL for the .ics so it downloads without a server round-trip. */
export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
