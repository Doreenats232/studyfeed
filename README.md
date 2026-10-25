# StudyFeed
Express + static frontend in one Render service. Pushes to `main` auto-deploy through a Render deploy hook (GitHub Actions secret `RENDER_DEPLOY_HOOK`).

Env vars on Render: `ADMIN_PASSWORD`, `VAULT_KEY` (+ optional `VAULT_URL`), `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `YT_API_KEY`.
Content is saved to the TeraBox vault as compressed `studyfeed-db-*.bin` files.
