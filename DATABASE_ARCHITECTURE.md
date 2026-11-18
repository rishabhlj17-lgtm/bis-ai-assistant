# BIS Sathi AI — data and language foundation

## Isolation boundary

BIS Sathi AI owns its own Cloudflare D1 database. It must not share a database,
SQLite file, credentials, migrations, or connection binding with NEMIX or Navkar.
NEMIX may coordinate work across projects, but each project keeps its own data
store and project-scoped credentials. No cross-project database access is
created by this schema.

The current BIS Worker configuration does not yet declare a D1 binding. This
change therefore adds the schema and deployment guidance only; it does not
pretend that a production database has already been provisioned or connected.

## Initial schema

Apply `migrations/0001_initial.sql` to a newly created BIS-only D1 database.
It separates:
- Indian Standard metadata (`standards`)
- official BIS source records (`official_sources`)
- source excerpts with language metadata (`source_excerpts`)
- translated content and review state (`translations`)
- optional, minimal user feedback (`feedback`)
- administrative change history (`audit_log`)
- opaque, expiring session references (`session_refs`)

Do not put API keys, raw IP addresses, passwords, or full chat transcripts in
these tables. Keep Gemini and Turnstile credentials in Cloudflare Worker
secrets. Public assistant requests should remain anonymous by default.

## Seven initial interface languages

Use BCP-47 language tags consistently:
- English: `en`
- Hindi: `hi`
- Gujarati: `gu`
- Tamil: `ta`
- Telugu: `te`
- Kannada: `kn`
- Malayalam: `ml`

The language list is a product target, not a claim that every answer is already
translated or quality-validated. Translation rows default to
`machine_draft`; technical/legal translations must not be labelled approved
until reviewed. Keep IS numbers, standard titles, clause references, units,
and legal wording traceable to the original official source.

## Safe provisioning sequence

1. Create a new D1 database dedicated to BIS Sathi AI in the correct Cloudflare
   account and environment.
2. Apply the migration to that database only.
3. Add its database ID to the BIS Worker `wrangler.toml` under a binding named
   `BIS_DB`; do not copy any NEMIX or Navkar database identifiers.
4. Deploy to a preview environment and test reads/writes before production.
5. Add repository/service code that uses `env.BIS_DB` only after the binding
   exists and is tested.
6. Configure backups/retention and restrict write operations to authenticated
   admin workflows.

No database has been provisioned, migrated, or deployed by this repository
change. Cloudflare account access and the actual D1 database ID are still
required for that step.
