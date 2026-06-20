"use client";
// src/app/overlay/scene/[id]/SceneClient.tsx
// Composites a scene's elements (#550) as transparent, absolutely-positioned iframes of
// the real /overlay/<widget> pages. The token from THIS source URL is forwarded to each
// child iframe (which validates it). Pure layout — no feed logic of its own.
import { useEffect, useState } from "react";
import { SCENE_WIDGETS, type SceneElement } from "@/lib/overlay-scenes";

const BY_ID = new Map(SCENE_WIDGETS.map((w) => [w.id, w]));

export function SceneClient({ elements, found }: { elements: SceneElement[]; found: boolean }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(new URL(window.location.href).searchParams.get("token"));
  }, []);

  if (token === undefined) return null; // token not read yet (avoid a flash with no token)
  if (!found) return <StatusBox msg="Scene not found" />;
  if (!token) return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (elements.length === 0) return <StatusBox msg="Empty scene — add widgets in /admin#scenes" />;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {elements.map((el) => {
        const w = BY_ID.get(el.widget);
        if (!w) return null;
        const q = new URLSearchParams();
        q.set("token", token);
        if (w.query) for (const [k, v] of new URLSearchParams(w.query)) q.set(k, v);
        return (
          <iframe
            key={el.id}
            src={`${w.path}?${q.toString()}`}
            title={el.widget}
            scrolling="no"
            style={{
              position: "absolute",
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
              border: "none",
              background: "transparent",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}

function StatusBox({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", top: 12, left: 12, padding: "6px 10px", background: "rgba(0,0,0,0.7)", color: "#fca5a5", fontFamily: "monospace", fontSize: 12, borderRadius: 6 }}>
      {msg}
    </div>
  );
}
