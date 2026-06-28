// ESLint 9 flat config. Next 16 removed `next lint`, and eslint-config-next 16
// ships a native flat config (Linter.Config[]) requiring ESLint >=9. We spread
// its core-web-vitals preset and keep the two rules we intentionally disable.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      // Hobby plan: native <img> avoids the image-optimizer quota (ROADMAP §3).
      "@next/next/no-img-element": "off",
      // Admin sections legitimately use <a href="/api/..."> to trigger full-page
      // navigations to API endpoints (OAuth-start redirects + the backup download) —
      // <Link> would prefetch/client-nav and break those. The rule also misfires on
      // these /api links after the [locale] i18n restructure. Off intentionally.
      "@next/next/no-html-link-for-pages": "off",
      // React Compiler correctness rules (eslint-plugin-react-hooks v7, via
      // eslint-config-next 16). The compiler IS enabled (next.config `reactCompiler: true`),
      // but these rules flag idiomatic patterns in this app. Verified count (#732, rules
      // flipped on locally): 110 warnings = 98 `set-state-in-effect` + 5 `purity` + 5
      // `immutability` + 2 `refs`. The 98 are overwhelmingly the standard client-side
      // DATA-FETCHING pattern (`useEffect(() => { apiGet().then(setState) }, [])`); the other
      // 12 are Date.now()/ref reads in live-countdown overlays. The compiler safely BAILS OUT
      // of optimizing such components (it never miscompiles them — they just stay un-memoized),
      // so these stay OFF. "Fixing" them would mean migrating every client fetch to RSC/SWR (an
      // architecture change) or 98 inline-disable comments (noisier than this) — no correctness
      // gain, real regression risk. Deliberate, permanent decision, not deferred debt. #audit3/#732
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
