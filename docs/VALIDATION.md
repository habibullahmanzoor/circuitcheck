# Validation

Every golden value below is asserted in `src/engine/__tests__/golden.test.ts`.
None are copied from a standards table: each is either derived by hand from the
formulas in the build plan or taken from the BS EN 60228 resistance constants
that the plan supplies.

| Quantity | Expected | Tolerance | Origin |
|---|---|---|---|
| Zs_max, B16 | 2.73 Ω | ±0.01 | 0.95 × 230 / (5 × 16) = 2.731 |
| Zs_max, B32 | 1.37 Ω | ±0.01 | 0.95 × 230 / (5 × 32) = 1.366 |
| Zs_max, C16 | 1.37 Ω | ±0.01 | 0.95 × 230 / (10 × 16) = 1.366 |
| Zs_max, C32 | 0.68 Ω | ±0.01 | 0.95 × 230 / (10 × 32) = 0.683 |
| Vd, 2.5 mm² Cu PVC, 1φ | 17.8 mV/A/m | ±0.3 | 2 × 7.41 × 1.20 = 17.78 |
| Vd, 1.5 mm² Cu PVC, 1φ | 29.0 mV/A/m | ±0.5 | 2 × 12.1 × 1.20 = 29.04 |
| (R1+R2) cold, 2.5 line + 1.5 cpc | 19.51 mΩ/m | exact (6 dp) | 7.41 + 12.1 |
| Worked example 2.5 mm², 20 m, 16 A, 1φ | ≈ 5.7 V (≈ 2.5 %) | recomputed in test | 2 × 0.00741 × 1.2 × 20 × 16 = 5.69 V |
| Fault withstand S_min | I·√t/k | 10 decimal places | three input sets (1000 A/0.1 s/115; 3200 A/0.4 s/143; 450 A/0.2 s/115) |
| 1.0 mm² cpc fails, 1.5 mm² passes | at 436 A, 0.1 s, k = 115 | n/a | S_min = 436 × √0.1 / 115 = 1.20 mm² |

## Property tests

Hand-rolled loops over fixed grids (no randomness): voltage drop rises with
length and current and falls with csa; Zs_max falls as In rises; no check
returns `NaN` for any positive finite input.

## Suggestions

Every suggestion is produced by re-running the full check set on the modified
circuit. It is only shown if the failing check passes and no previously
non-failing check starts to fail (`designCheck.ts`, `verify`).

## Not validated

- Constants marked `TODO(verify)` (hot multipliers, k factors, drop limits,
  Cmin, clause references) are taken from the build plan and have **not** been
  checked against a licensed copy of BS 7671.
- The demo ampacity table is synthetic (see `DECISIONS.md`) and has no
  external validation by design.
