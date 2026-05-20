# Dashboard Overview

## Agent Roster

1. `Atlas` - Scout Agent - color `#2EC4B6`
2. `Prism` - Feasibility Agent - color `#FF9F1C`
3. `Forge` - Builder Agent - color `#4CC9F0`
4. `Sentinel` - Ops Agent - color `#FF6B6B`

## Visualization Model

The dashboard uses four synchronized views:

1. Agent Cards
   - queue load,
   - completed jobs,
   - reliability score,
   - current work mode.
2. Flow View
   - stage-by-stage throughput from Scout -> Feasibility -> Builder -> Ops.
3. Funding Funnel
   - discovered, shortlisted, submitted, won, paid.
   - each stage is clickable and expands a dropdown detail table:
     site, type, price, won, overdue, due date.
4. Jobs Table
   - active jobs with owner, state, ETA, and expected value.
5. Hover Tooltips
   - semi-glass overlay per agent card with face asset, name, and core functions.
6. Solved Bounties Table
   - solved bounty IDs with pipeline stage and folder archive status (`pending`, `tracked`, `failed`).

## Interaction

- `Reset`: restores default metrics/jobs and stops live simulation.
- `Run 1 Cycle`: executes one update tick.
- `Start Live Sim`: runs recurring updates every ~2.2 seconds.
- `Start Scrape Engine`: enables Scout scraping scheduler.
- `Fast Poll`, `Deep Scan`, `Full Refresh`: manual scrape triggers.
- `Agent Filter`: isolate jobs by owner.
- `Create Report`: generates a funnel report from the current funnel dataset.
- `Download Excel Report`: saves a `.xlsx` report.
  - first use prompts for a target folder; choose `dashboard/reports`.
  - subsequent saves reuse the same folder permission.
  - if folder write is unavailable, browser download fallback is used.
- `Connect Track Folder`: select a local folder where solved bounty project copies are written.

## Runtime Behavior

- While live sim is running, agents keep working continuously, including when the window is minimized.
- Agents stop only when live sim is stopped, dashboard is reset, or the dashboard window is closed.
- If browser throttling delays background ticks, scheduler catch-up runs when timing resumes.
- Scout schedule:
  - Fast Poll every 5-15 minutes.
  - Deep Scan every 30-60 minutes.
  - Full Refresh every 6-24 hours.
  - only Scout searches and passes work to other agents.
- Agent runtime light:
  - `Off` (gray),
  - `Working` (green),
  - `Standby` (amber).

## Local Run

Open `dashboard/index.html` in a browser, or serve the folder with a static server.

## Supabase Auth Gate

- The dashboard is now protected behind Supabase email/password auth.
- Supabase is hard-wired to project `DEV-BOUNTIES` (`mwniqoxghjquriybjdjs`) in `andfar83's Org`.
- On the sign-in screen, users enter `email` + `password` and a required comment.
- Use `Create Account` to register users from the same screen.
- If your Supabase project has email confirmation enabled, users must verify email before first login.
- Use `Sign Out` in the dashboard top bar to leave the session.
- Run [`supabase-user-profiles.sql`](./supabase-user-profiles.sql) in Supabase SQL Editor once:
  - creates `public.user_profiles`,
  - enables RLS,
  - allows authenticated users to insert/select/update only their own row.
- After this setup, each successful sign in/session restore upserts:
  - `id` (auth user id),
  - `email`,
  - `last_login_at`,
  - `latest_comment` (when provided on auth submit).
- Every auth comment is also stored in `public.user_comments` with timestamp.
