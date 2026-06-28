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
      // React Compiler correctness rules (eslint-plugin-react-hooks v7, via eslint-config-next
      // 16; compiler is ON via next.config `reactCompiler: true`). Original audit count: 110 =
      // 98 `set-state-in-effect` + 5 `purity` + 5 `immutability` + 2 `refs`.
      //
      // purity/immutability/refs are NOW ENFORCED (#733): the 12 real hits were resolved — 2
      // structural fixes (use-focus-trap ref→effect, OverlayClient self-ref→ref) + targeted
      // inline-disables on the legitimately-flagged ones (server-component Date.now, Date.now /
      // navigation / DOM writes inside click handlers, one live drift-corrected countdown). So
      // any NEW violation of these three now fails lint.
      //
      // `set-state-in-effect` stays OFF: its 98 hits are all the standard client-side
      // DATA-FETCHING pattern (`useEffect(() => { apiGet().then(setState) }, [])`). The compiler
      // safely BAILS OUT (never miscompiles — components just stay un-memoized). Enabling it would
      // need ~98 inline-disables (noise) or migrating every fetch to RSC/SWR (architecture change)
      // — no correctness gain. Deliberate decision, not deferred debt. #audit3/#732/#733
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "error",
      "react-hooks/immutability": "error",
      "react-hooks/refs": "error",
    },
  },
];

export default eslintConfig;
