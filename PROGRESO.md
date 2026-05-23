# PROGRESO — FOCO PRO testing rollout

## FASE 0 — Bootstrap testing infra

- Backend: `codemapper-backend/src/test/java/com/codemapper/focus/FocusTestFixtures.java`
  helpers reusables para armar proyectos Java sintéticos vía `Files.createTempDirectory`.
- Frontend: vitest 4.1.7 + @testing-library/react + jsdom + Playwright 1.60 (Chromium descargado).
- Configs: `vitest.config.ts` (alias `@/*`), `playwright.config.ts` (headed, slowMo 200, timeout 120s, screenshot on failure, sin webServer).
- Scripts npm: `pnpm test` (vitest) y `pnpm test:e2e` (playwright).
- Orquestador: `scripts/validate.ps1` — mata :8090/:3000, valida Reserva (>10 .java), levanta backend + frontend, corre mvn/vitest/playwright, cleanup en `finally`.
- Loop: `scripts/loop-infinito.ps1 -Point N` — sin cap, escribe iter+resultado a PROGRESO.md.
- E2E smoke: `e2e/smoke.spec.ts` (asegura que Chromium abre y `/` responde HTTP).

### Verificación FASE 0

`powershell.exe -File scripts/validate.ps1` → exit 0. Output observado:

```
[validate] Reserva OK: 292 .java
[validate] backend up :8090
[validate] frontend up :3000
[validate] mvn -q test...
[validate] pnpm test (vitest)... No test files found, exiting with code 0
[validate] pnpm test:e2e (filter='')...
  ✓  1 e2e\smoke.spec.ts:9:5 › frontend root responds (24.7s)
[validate] ALL GREEN
```

FASE 0 LISTA — pedir prompt 2/6
