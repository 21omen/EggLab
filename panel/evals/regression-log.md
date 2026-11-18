# Regression log

Record each meaningful behavior change and its benchmark impact.

| Date | Change | Affected modules | Tests run | Regressions | Decision |
|---|---|---|---|---|---|
| 2026-11-12 | Initial v2 modular migration | Core, router, eight skills | Pending host integration | Not yet measured | Candidate package |
| 2026-11-18 | Direct `egl_*` tool surface + inspect | MCP config, prompt, gate | surface + 24 live checks (hy4); 20-tool profile | none observed | Shipped 0.3.18 |
| 2026-11-18 | Region-edit composite + production eval | `http.mjs`, `pngfeather.mjs`, evals | 31/31 live checks on deepseek-v4.1-flash; composite unit test | none observed | Shipped 0.3.19 |
| 2026-11-18 | Session/doc/chat recovery | `chat.mjs`, `sessions.mjs`, history names | 10 files migrated, 7 transcripts recovered, session/switch/send tests, static gate | none observed | Shipped 0.3.20 |

## Entry template
- Date/version:
- Symptom and trace ID:
- Root cause:
- Rule/reference changed:
- Benchmark cases run:
- Before / after:
- New failure introduced:
- Human approval:
