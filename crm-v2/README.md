# Satori CRM v2

Satori CRM v2 is deployed from the MIT-licensed upstream project:

- Upstream: https://github.com/alive-home/crm
- Pinned revision: `b2642a2f20705eb5511ccbd3c1553b98cc7de018`
- License: MIT (the upstream `LICENSE` file is preserved in the deployed source)

We intentionally do not vendor the whole upstream application into the Satori website repository. The deployment workflow clones the pinned upstream revision on the server, applies a small Satori compatibility patch for a local libSQL/SQLite database, builds it, and runs it as an independent service.

Production plan:

- Existing CRM remains on `127.0.0.1:3010` during migration/rollback window.
- CRM v2 stages on `127.0.0.1:3020`.
- Persistent v2 database lives outside the source tree at `/var/lib/satori-crm-v2/crm.db`.
- After data migration and acceptance checks, Nginx can switch `crm.satorilabural.online` from port 3010 to 3020 without changing the website.

The Satori-specific integrations (website intake/status sync, Wazzup, AI brief manager) are added as adapters after the base CRM is verified stable rather than mixed into the upstream application bootstrap.
