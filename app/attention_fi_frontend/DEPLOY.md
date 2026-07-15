# Deploying AttentionFi v0 to Vercel

The Phase 0 site (feed + gamified waitlist). The waitlist persists to **Postgres**
in production and falls back to a local file store in dev — so signups are only
durable once a database is attached (below).

## 1. Import the repo

Vercel → **Add New… → Project** → import `Diam0naz/attention-fi`.

> **Root Directory (important):** the Next.js app lives in a subfolder. Set
> **Root Directory = `app/attention_fi_frontend`**. Framework preset auto-detects
> as **Next.js**; leave build/output at defaults.

## 2. Attach Postgres (persists the waitlist)

Project → **Storage → Create Database → Postgres (Neon)** → connect it to the
project. This auto-injects `DATABASE_URL` / `POSTGRES_URL` into the environment.

- No migration needed — the schema (`waitlist_signups` + rank index) is created on
  the first API call (`create table if not exists`).
- Without a database attached, the app still builds and renders, but signups won't
  persist (the file store isn't writable on serverless).

## 3. Deploy

Deploy from the dashboard (or `git push` — Vercel auto-deploys `main`). You get a
production URL plus a preview URL per branch — the links to share.

## 4. Verify

- Open the site → the feed + hero render.
- Click **Join Waitlist**, sign up → you get a position + referral link.
- Refresh / open in another browser via `/?ref=<code>` → the referral credits (+75)
  and the leaderboard updates. Persistence is confirmed once a second visit shows
  your prior position.

## Environment summary

| Var | Set by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` / `POSTGRES_URL` | Vercel Postgres integration | selects the Postgres store |

Nothing else is required. Locally (`npm run dev`) with no DB URL, the file store is
used automatically.
