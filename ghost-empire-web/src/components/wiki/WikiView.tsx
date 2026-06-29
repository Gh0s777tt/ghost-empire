"use client";
// src/components/wiki/WikiView.tsx
// Publiczna wiki platformy (#745): TOC + sekcje (Dla widzów / Panel streamera /
// Komendy / Dla developerów) z osadzonymi zrzutami z public/wiki/screens.
import { useEffect, useState } from "react";
import { BookOpen, Users, SlidersHorizontal, Terminal, Code2, FileText } from "lucide-react";
import {
  WIKI_INTRO, VIEWER_GROUPS, ADMIN_GROUPS, ADMIN_INTRO, COMMAND_GROUPS, DEV_SECTIONS,
  type WikiItem, type WikiGroup,
} from "@/lib/wiki-content";

const TOP = [
  { id: "intro", label: "Wprowadzenie", icon: BookOpen },
  { id: "widzowie", label: "Dla widzów", icon: Users },
  { id: "streamer", label: "Panel streamera", icon: SlidersHorizontal },
  { id: "komendy", label: "Komendy czatu", icon: Terminal },
  { id: "dev", label: "Dla developerów", icon: Code2 },
];

function Shot({ name, alt }: { name: string; alt: string }) {
  return (
    <figure className="mt-3 border border-zinc-800 bg-black/40 overflow-hidden rounded-lg shadow-lg">
      <img src={`/wiki/screens/${name}.jpg`} alt={alt} loading="lazy" className="w-full block" />
    </figure>
  );
}

function Item({ item }: { item: WikiItem }) {
  return (
    <div className="border-s-2 border-zinc-800 ps-4 py-2.5">
      <h4 className="text-white font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">
        {item.title}
        {item.route && <code className="text-[11px] text-red-400 font-mono bg-red-950/20 px-1.5 py-0.5 rounded">{item.route}</code>}
      </h4>
      <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{item.desc}</p>
      {item.steps && (
        <ol className="list-decimal ms-5 mt-2 text-sm text-zinc-300 space-y-1">
          {item.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {item.shot && <Shot name={item.shot} alt={item.title} />}
    </div>
  );
}

function Group({ group }: { group: WikiGroup }) {
  return (
    <section id={group.id} className="scroll-mt-24 pt-6">
      <h3 className="font-display text-xl text-white tracking-wide uppercase border-b border-zinc-800 pb-2 mb-3">{group.title}</h3>
      {group.intro && <p className="text-sm text-zinc-500 mb-3">{group.intro}</p>}
      <div className="space-y-1">
        {group.items.map((it) => <Item key={it.title} item={it} />)}
      </div>
    </section>
  );
}

export function WikiView() {
  const [active, setActive] = useState("intro");

  useEffect(() => {
    const ids = [
      "intro", "widzowie", ...VIEWER_GROUPS.map((g) => g.id),
      "streamer", ...ADMIN_GROUPS.map((g) => g.id), "komendy", "dev",
    ];
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const tocActive = (id: string) =>
    active === id || VIEWER_GROUPS.some((g) => g.id === active && id === "widzowie") || ADMIN_GROUPS.some((g) => g.id === active && id === "streamer");

  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      {/* TOC */}
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1" aria-label="Spis treści">
          {TOP.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest border-s-2 transition-colors ${
                tocActive(id) ? "border-red-600 text-white bg-red-950/20" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
            </a>
          ))}
          <a href="/wiki/E-Forge-Przewodnik-Kompletny.pdf" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 mt-3 text-[11px] text-amber-300/80 hover:text-amber-200 border border-amber-700/40">
            <FileText className="w-3.5 h-3.5 shrink-0" /> Kompletny przewodnik (PDF)
          </a>
          <a href="/wiki/Ghost-Empire-Developer.pdf" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-400 hover:text-white border border-zinc-700">
            <FileText className="w-3.5 h-3.5 shrink-0" /> PDF dla developerów
          </a>
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0">
        {/* Intro */}
        <section id="intro" className="scroll-mt-24">
          <h1 className="font-display text-4xl text-white tracking-wide flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-red-500" /> {WIKI_INTRO.title}
          </h1>
          <p className="text-zinc-300 mt-3 leading-relaxed max-w-3xl">{WIKI_INTRO.lead}</p>
          <ul className="mt-4 space-y-1.5 text-sm text-zinc-400 max-w-3xl">
            {WIKI_INTRO.bullets.map((b, i) => (
              <li key={i} className="flex gap-2"><span className="text-red-500">▸</span> {b}</li>
            ))}
          </ul>
          {/* PDF links (mobile-visible) */}
          <div className="flex flex-wrap gap-2 mt-5 lg:hidden">
            <a href="/wiki/E-Forge-Przewodnik-Kompletny.pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-amber-300 border border-amber-700/50"><FileText className="w-3.5 h-3.5" /> Przewodnik (PDF)</a>
            <a href="/wiki/Ghost-Empire-Developer.pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-300 border border-zinc-700"><FileText className="w-3.5 h-3.5" /> PDF developer</a>
          </div>
        </section>

        {/* Dla widzów */}
        <section id="widzowie" className="scroll-mt-24 pt-10">
          <h2 className="font-display text-3xl text-white tracking-wide flex items-center gap-2"><Users className="w-7 h-7 text-red-500" /> Dla widzów</h2>
          <p className="text-sm text-zinc-500 mt-1">Jak zdobywać tokeny i korzystać z funkcji portalu.</p>
          {VIEWER_GROUPS.map((g) => <Group key={g.id} group={g} />)}
        </section>

        {/* Panel streamera */}
        <section id="streamer" className="scroll-mt-24 pt-12">
          <h2 className="font-display text-3xl text-white tracking-wide flex items-center gap-2"><SlidersHorizontal className="w-7 h-7 text-red-500" /> Panel streamera (admin)</h2>
          <p className="text-sm text-zinc-500 mt-1 max-w-3xl">{ADMIN_INTRO}</p>
          {ADMIN_GROUPS.map((g) => <Group key={g.id} group={g} />)}
        </section>

        {/* Komendy */}
        <section id="komendy" className="scroll-mt-24 pt-12">
          <h2 className="font-display text-3xl text-white tracking-wide flex items-center gap-2"><Terminal className="w-7 h-7 text-red-500" /> Komendy czatu</h2>
          <p className="text-sm text-zinc-500 mt-1">Działają na Twitch, Kick i YouTube. Streamer może dodawać własne w panelu.</p>
          <div className="mt-4 space-y-5">
            {COMMAND_GROUPS.map((cg) => (
              <div key={cg.title}>
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-2">{cg.title}</h3>
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  {cg.items.map((c, i) => (
                    <div key={c.cmd} className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2.5 ${i % 2 ? "bg-black/20" : "bg-black/40"}`}>
                      <code className="text-xs font-mono text-red-400 sm:w-72 shrink-0">{c.cmd}</code>
                      <span className="text-sm text-zinc-300 flex-1">{c.desc}</span>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 shrink-0">{c.who}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-zinc-600">* wymaga klucza AI ustawionego przez streamera w sekcji Integracje.</p>
          </div>
        </section>

        {/* Dla developerów */}
        <section id="dev" className="scroll-mt-24 pt-12 pb-10">
          <h2 className="font-display text-3xl text-white tracking-wide flex items-center gap-2"><Code2 className="w-7 h-7 text-red-500" /> Dla developerów</h2>
          <p className="text-sm text-zinc-500 mt-1">Skrót techniczny — pełna wersja w <a href="/wiki/Ghost-Empire-Developer.pdf" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 underline">PDF dla developerów</a>.</p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {DEV_SECTIONS.map((d) => (
              <div key={d.title} className="border border-zinc-800 bg-black/30 rounded-lg p-4">
                <h3 className="text-white font-semibold text-sm">{d.title}</h3>
                <p className="text-[13px] text-zinc-400 mt-1 leading-relaxed">{d.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
