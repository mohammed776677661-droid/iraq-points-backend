# Render PostgreSQL backend patch

Set Render Environment variables:
- DATABASE_URL = Internal Database URL from your Render PostgreSQL database
- ADMIN_KEY = strong secret stored only in Render (never put it in index.html or GitHub)

Endpoints:
- GET /api/health
- POST /api/admin/access-codes (x-admin-key header, JSON {"days":30})
- POST /api/access-codes/verify (JSON {"code":"...","studentId":"..."}; code redeems once)
- GET /api/students/:studentId/points
- POST /api/admin/students/points (x-admin-key)
- POST /api/referrals/claim (JSON {"referrerId":"...","studentId":"..."}; awards 10 points once)
- GET /api/referrals/:studentId/stats

Tables are created on startup. Existing points.json data is not migrated automatically; back it up before replacing the old server. Frontend must call these exact routes and must not contain ADMIN_KEY.
