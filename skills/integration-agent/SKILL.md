# Skill: Integration Agent

## Purpose

Design, integrate, validate, and operate external incentive systems for a 2D game (offerwalls, rewarded actions, quests, codes, gift-like rewards, or tokenized rewards) with strong safety, economics, and reliability.

## Mission Definition

- Primary objective: increase player activation, retention, and monetization without harming trust or game balance.
- Secondary objective: enable multi-platform reward integrations with low operational overhead.
- Hard constraints:
  - comply with platform/store/ad policies,
  - protect users and data,
  - prevent fraud/abuse,
  - avoid pay-to-win collapse.

## Inputs

- Game profile:
  - genre, loop, progression model, currency sinks/sources, target regions.
- Technical profile:
  - engine/framework (Unity, Godot, Phaser, custom),
  - client/server topology,
  - auth/account model,
  - analytics stack.
- Business profile:
  - KPI targets,
  - monetization goals,
  - acceptable risk level.
- Candidate providers:
  - offerwalls/ad networks,
  - quest systems,
  - reward APIs,
  - campaign platforms.

## Outputs

- `integration_strategy.md`:
  - recommended providers by tier (primary, secondary, backup).
  - rationale and risk profile.
- `provider_scorecard.json`:
  - feature, economics, compliance, reliability, support, fraud resilience.
- `economy_impact_model.md`:
  - reward caps, pacing, sink balancing, abuse pressure points.
- `integration_plan.md`:
  - architecture, milestone plan, rollout strategy, test matrix.
- `live_ops_playbook.md`:
  - dashboards, alert rules, incident response, optimization cadence.

## Supported Incentive Patterns

- Offerwall/rewarded action:
  - users complete external actions and receive in-game currency/items.
- Quest and mission campaigns:
  - on-platform/off-platform tasks with reward claims.
- Promo code campaigns:
  - scheduled drops, creator codes, partner promotions.
- Skill-based events:
  - leaderboard or challenge rewards.
- Web3 or digital asset rewards:
  - only where legally and operationally viable.

## Provider Evaluation Framework

Score each provider from 0-100:

- Technical fit (0-20):
  - SDK maturity, docs quality, platform support, server callbacks.
- Economics (0-20):
  - eCPM/ARPDAU impact expectations, fees, payout terms.
- Compliance safety (0-20):
  - store policy compatibility, privacy controls, age handling.
- Fraud resistance (0-15):
  - anti-abuse controls, signal quality, dispute workflow.
- Reliability/SLA (0-15):
  - uptime history, latency, callback consistency.
- Support/operability (0-10):
  - response quality, debug tooling, transparency.

Decision thresholds:

- >= 80: production candidate.
- 65-79: pilot candidate.
- < 65: reject or monitor.

## Hard Rejection Rules

Reject providers if any is true:

- ambiguous or predatory user experience.
- weak fraud controls and no meaningful dispute path.
- policy conflict with target app stores or regions.
- unclear payout/attribution logic.
- missing data processing terms for required jurisdictions.

## Architecture Standards

- Use server-side verification for every reward claim when possible.
- Never grant durable rewards from client-only events.
- Implement idempotent reward grant endpoint:
  - safe to retry without double-crediting.
- Require signed callbacks/webhooks and timestamp validation.
- Keep a reward ledger:
  - user_id, provider_event_id, reward_type, amount, status, timestamps.
- Separate “eligibility” from “grant”:
  - evaluate eligibility rules before final credit.

## Economy Design Rules

- Reward value must map to economy sinks; no free inflation.
- Set daily and weekly caps per user and per reward channel.
- Use diminishing returns for repeated low-value loops.
- Keep core progression skill-based; rewards should accelerate, not replace gameplay.
- Prevent pay-to-win:
  - cosmetics/utility-first rewards when possible.
  - if power rewards exist, cap advantage windows.

## Fraud and Abuse Controls

- Device/account heuristics:
  - multi-account detection, impossible velocity, pattern anomalies.
- Cooldowns:
  - per-offer, per-device, per-account.
- Risk scoring:
  - low/medium/high trust buckets with adaptive reward release.
- Hold-and-release policy:
  - pending state for suspicious or high-value claims.
- Manual review workflow:
  - audit queue with evidence snapshots.

## Privacy, Legal, and Policy Controls

- Data minimization:
  - store only what is required for attribution and audit.
- Consent and disclosure:
  - clear user-facing language for reward mechanics and third-party interactions.
- Region compliance:
  - COPPA/age-gating, GDPR/CCPA style requirements where applicable.
- Store policy alignment:
  - Apple/Google ad/reward and external link constraints.
- Auditability:
  - maintain records of policy decisions and provider agreements.

## Performance and Reliability Standards

- Reward decision endpoint p95 latency target <= 300ms (excluding provider delays).
- Callback processing success >= 99.5%.
- Duplicate grant rate <= 0.1%.
- Unresolved reward disputes <= target SLA threshold.
- Dashboard freshness under 5 minutes for live monitoring.

## Rollout Strategy

Phase 1: Internal sandbox

- mock callbacks,
- failure injection,
- ledger reconciliation tests.

Phase 2: Closed pilot (1-5% traffic)

- selected region or cohort,
- strict caps,
- daily review.

Phase 3: Controlled expansion

- 10% -> 25% -> 50% -> 100%,
- gated by KPI and incident thresholds.

Rollback criteria (automatic/manual):

- fraud spike beyond threshold,
- reward grant failure surge,
- retention or sentiment regression,
- policy risk signal.

## Experimentation Framework

- Define primary KPI:
  - D1/D7 retention, ARPDAU, payer conversion, session depth.
- Define guardrail KPIs:
  - churn rate, support tickets, fraud rate, economy inflation.
- Run A/B tests with clean cohort assignment.
- Use statistically valid sample sizing and test duration.
- Ship only when lift is meaningful and guardrails remain healthy.

## Observability and Monitoring

Required dashboards:

- Reward funnel:
  - offer shown -> started -> completed -> validated -> credited.
- Economy impact:
  - reward inflow vs currency sinks.
- Abuse board:
  - suspicious events, blocked grants, dispute volumes.
- Reliability board:
  - webhook failures, retry rates, queue lag.

Alerting:

- high fraud anomaly,
- callback outage,
- ledger mismatch,
- dispute backlog SLA breach.

## Incident Response

Incident classes:

- `P1`: active exploit, mass over-crediting, policy breach risk.
- `P2`: elevated failures or dispute spike.
- `P3`: localized bug with low blast radius.

Response SLAs:

- P1: immediate freeze/kill-switch path, response <= 15 minutes.
- P2: mitigation <= 2 hours.
- P3: next planned patch window.

Post-incident requirements:

- root cause analysis,
- compensation/remediation plan,
- permanent preventive controls.

## Best Practices

- Start with one high-quality provider before multi-provider complexity.
- Keep provider abstraction layer to avoid lock-in.
- Build a unified reward policy engine independent of provider logic.
- Use progressive trust:
  - new users start with tighter limits.
- Keep player-facing messaging transparent and fair.

## Anti-Patterns

- Client-side reward grants without server verification.
- Unlimited or uncapped reward channels.
- Integrating many providers before first one stabilizes.
- Ignoring support/dispute handling until after launch.
- Optimizing only short-term revenue while harming retention/trust.

## KPIs

- Retention lift (D1/D7/D30) from incentive cohorts.
- Monetization lift (ARPDAU/payer conversion).
- Fraud-adjusted net value.
- Reward dispute rate and resolution time.
- System reliability (success rate, latency, duplicate grants).

## Definition of Done

Integration work is complete when:

- provider selection is evidence-backed,
- integration passes security/compliance/reliability gates,
- pilot KPIs are positive with safe guardrails,
- live ops playbook and incident workflows are active,
- rollback and kill-switches are verified.
