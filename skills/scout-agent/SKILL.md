# Skill: Scout Agent

## Purpose

Find, triage, and rank bounty opportunities with high expected value (EV), high fit, and realistic execution probability.

## Mission Definition

- Primary objective: maximize weekly expected payout while preserving team focus.
- Secondary objective: build a pipeline of medium-term opportunities.
- Hard constraint: do not pass low-trust or non-compliant opportunities downstream.

## Inputs

- Profile:
  - Team capabilities (languages, engines, domains, infra).
  - Available hours this week and this month.
  - Risk tolerance (low, medium, high).
  - Preferred payout floor.
- Market:
  - Bounty boards, bug bounty platforms, hackathons, grants, contests.
- History:
  - Past submissions, win rates, postmortems, strengths/weaknesses.

## Outputs

- `shortlist.json` with top candidates:
  - `id`, `title`, `platform`, `deadline_utc`, `payout_usd`, `difficulty`.
  - `fit_score`, `ev_score`, `confidence`, `red_flags`.
  - `next_action` (discard, monitor, evaluate_now).
- `scout_report.md`:
  - why each selected bounty made the cut.
  - why rejected opportunities were rejected.

## Prioritization Model

Use a weighted score from 0-100:

- `Fit` (0-25): technical alignment with known strengths.
- `Payout Quality` (0-20): reward vs complexity and payout credibility.
- `Deadline Feasibility` (0-15): can complete before deadline with buffers.
- `Win Probability` (0-20): competition intensity and uniqueness advantage.
- `Strategic Value` (0-10): portfolio/reputation/network upside.
- `Platform Trust` (0-10): payout history, rules clarity, dispute reputation.

Total score rule:

- >= 75: evaluate immediately.
- 60-74: monitor and re-check within 48h.
- < 60: archive unless strategic exception.

## Hard Rejection Rules

Reject immediately if any of the following are true:

- No explicit payout terms or prize disbursement process.
- Ambiguous ownership/IP terms that transfer excessive rights without compensation.
- Deadlines impossible for current capacity.
- Rules that require unethical behavior, policy violations, or fake engagement.
- Suspicious platform signals (non-verifiable organizer identity + no history).

## Discovery Coverage Rules

For each scouting cycle:

- Scan at least 3 categories:
  - security/bug bounties,
  - dev/research bounties,
  - hackathon/grant style.
- Include at least 5 new opportunities and 5 carry-over monitored opportunities.
- Timestamp all collected entries and sources.

## Speed Operating Mode

- `Rapid Mode` (<= 30 minutes):
  - Use existing filters and produce a quick top-5 list.
  - Only publish items with confidence >= 0.6.
- `Deep Mode` (60-120 minutes):
  - Full scoring, trust checks, and competitor landscape snapshot.
  - Publish top-10 with confidence calibration.

## Reliability Controls

- Never score without source-backed evidence.
- Every bounty must include source URL and retrieval date.
- If fields are unknown, set `unknown` explicitly; never infer silently.
- Keep an immutable change log:
  - score changes,
  - reason for change,
  - actor/time.

## Best Practices

- Maintain keyword packs per specialty:
  - e.g., `three.js`, `phaser`, `gaussian splatting`, `cv`, `rendering`, `sdk`.
- Track seasonality:
  - conference hackathons,
  - quarterly grant windows,
  - ecosystem incentive campaigns.
- Use exclusion filters:
  - non-English rules if translation adds risk,
  - low-quality “engagement farming” tasks,
  - unfunded “exposure-only” contests.

## Common Failure Modes

- Overweighting payout size and ignoring feasibility.
- Ignoring “hidden work” in submission packaging requirements.
- Submitting too many low-probability opportunities and losing focus.
- Treating all platforms as equally trustworthy.

## KPIs

- Weekly qualified opportunities discovered.
- `% shortlisted that pass feasibility stage`.
- Average shortlist confidence.
- False-positive rate (shortlisted but later rejected by feasibility).
- Time-to-shortlist.

## Definition of Done

Scout cycle is complete when:

- Ranked shortlist is published.
- Rejection reasons are explicit.
- All entries have timestamps and source links.
- Next action for each candidate is assigned.
