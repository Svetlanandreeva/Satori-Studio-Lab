# Satori CRM v2

Satori CRM v2 is based on the MIT-licensed **Auto-CRM** project:

- Upstream: https://github.com/Hainrixz/auto-crm
- Pinned revision: `0aef51a9aef0487c59b964b4eea9d964a2321f0c`
- License: MIT. The upstream `LICENSE` notice is preserved in the staged/production application.

Why this base fits Satori:

- local SQLite database, no external database subscription;
- dashboard and KPI cards;
- drag-and-drop sales pipeline;
- contacts and deals;
- activity timeline, notes and follow-ups;
- WhatsApp quick actions;
- webhook/API for incoming website leads;
- CSV import/export;
- optional AI/MCP layer that can be replaced by Satori's OpenAI manager.

Deployment architecture:

- Current legacy CRM remains on `127.0.0.1:3010` during the migration window.
- Auto-CRM v2 stages on `127.0.0.1:3020`.
- Its persistent SQLite database lives at `/var/lib/satori-auto-crm/crm.db`, outside the deployment directory.
- The app is built in GitHub Actions using Node 22 and deployed as a Next.js standalone build, so the small VPS does not need to compile Next.js.
- After migration and validation, Nginx will switch `crm.satorilabural.online` from port 3010 to port 3020. The legacy service is retained temporarily for rollback.

Satori-specific work is applied as a thin layer on top of the ready CRM: Russian labels/stages, website intake/status mapping, structured technical brief, Wazzup transport, and the OpenAI sales manager.
