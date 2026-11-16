# Architecture

```
            ┌──────────────────────────────┐
 CSV / form │  src/ui  (React, state.ts)   │  localStorage (versioned, migrate())
   ───────▶ │  Board · Design · Site · Report │ ◀──────────────
            └──────────────┬───────────────┘
                           │ plain data in, CheckResult[] out
            ┌──────────────▼───────────────┐
            │  src/engine  (pure TypeScript) │  no DOM, no React, no randomness,
            │  conductors → voltageDrop      │  no runtime dependencies
            │  earthFault → faultWithstand   │
            │  ampacity (table is injected)  │
            │  designCheck → suggestions     │
            │  testCheck · csv               │
            └────────────────────────────────┘
```

- **The engine never imports from the UI.** The ampacity table is passed in as
  data; `src/data/loadAmpacity.ts` chooses between the bundled demo table and a
  git-ignored `ampacity.local.json`.
- **Every check returns a `CheckResult`** (formula, inputs, assumptions, clause
  reference, message). Bad input gives `INPUT_ERROR`, never an exception.
- **Suggestions are verified**: `designCheck.ts` re-runs the whole check set on
  each candidate change and only reports changes that pass.
- **No LLM does any arithmetic.** Same input, same output.
- **Offline**: `public/sw.js` precaches the shell (it discovers the hashed Vite
  asset names from `index.html` at install) and serves cache-first.
