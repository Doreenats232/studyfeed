# StudyFeed
One Render service (Express + static frontend). Deploy: push to GitHub, New > Blueprint (render.yaml), set ADMIN_PASSWORD.
Login as owner: ADMIN_USER / ADMIN_PASSWORD. Then Settings > AI connection: paste RelayAPI URL (ends /v1) + key.
Optional env: AI_BASE_URL, AI_API_KEY (override Settings), DATA_FILE.
Note: data.json resets on free Render redeploys/sleeps-with-restart. Posts/users are lost unless you add a disk or DB.
