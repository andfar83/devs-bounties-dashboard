# Skill: Feasibility Agent

## Purpose

Convert a promising bounty into a go/no-go decision with rigorous scope, effort, and risk assessment.

## Mission Definition

- Primary objective: eliminate weak opportunities early.
- Secondary objective: define a winning execution path for selected bounties.
- Hard constraint: no “go” decision without measurable acceptance criteria.

## Inputs

- Candidate package from Scout:
  - rules,
  - payout model,
  - deadlines,
  - platform constraints.
- Team context:
  - available capacity,
  - skill distribution,
  - infra/tooling readiness.
- Historic benchmarks:
  - similar tasks,
  - prior cycle time,
  - quality defects.

## Outputs

- `feasibility_report.md` with:
  - `decision`: go / conditional_go / no_go.
  - `confidence`: 0-1.
  - `scope_statement`.
  - `acceptance_criteria`.
  - `risk_register`.
  - `execution_plan`.
- `effort_estimate.json`:
  - optimistic, realistic, pessimistic hours.
  - critical path and slack buffer.

## Decision Framework

Decision must pass all five gates:

1. Rules Clarity Gate:
  - Submission requirements are explicit and testable.
2. Technical Gate:
  - Capability exists or can be acquired within timeline.
3. Time Gate:
  - Realistic estimate + 20-30% buffer <= time remaining.
4. Economic Gate:
  - EV above team threshold after risk adjustment.
5. Compliance Gate:
  - Legal/IP/privacy/security constraints are acceptable.

If any gate fails -> `no_go`, unless explicitly waived with documented rationale.

## Effort Estimation Spec

Use three-point estimate:

- `O` optimistic,
- `M` most likely,
- `P` pessimistic.

Compute expected effort:

- `E = (O + 4M + P) / 6`

Add buffers:

- Coordination buffer: 10-15%.
- Integration/packaging buffer: 10-20%.
- Unknowns buffer for novel domains: 10-25%.

## Risk Register Spec

Each risk must contain:

- `id`, `category`, `probability`, `impact`, `owner`.
- `trigger` (how risk materializes).
- `mitigation` (preventive).
- `contingency` (if mitigation fails).

Risk categories:

- Technical unknowns.
- Benchmark reproducibility.
- Rule interpretation ambiguity.
- Dependency/toolchain instability.
- Submission portal or compliance risk.

## Go/No-Go Thresholds

Default thresholds:

- Decision confidence >= 0.70.
- At least one validated implementation path.
- Critical risks with impact “high” must have mitigation and contingency.
- Remaining schedule slack >= 15%.

Conditional Go:

- Allowed only if:
  - blocking ambiguity is resolvable within 24 hours,
  - fallback strategy exists,
  - decision review is scheduled.

## Best Practices

- Build a “minimum winning artifact” definition before full execution.
- Separate mandatory from optional requirements.
- Identify measurable score drivers:
  - speed, accuracy, novelty, reproducibility, documentation quality.
- Validate hardware/runtime assumptions early.
- Confirm data licensing and usage terms before coding.

## Quality Controls

- Independent pass on rules interpretation.
- Cross-check estimates against at least one historical analog.
- Explicitly list assumptions and test them in first 20% of schedule.
- Store all unresolved questions in a blocker log with owner and due time.

## Reliability and Speed Balance

- Fast fail on weak bounties in <= 45 minutes.
- Spend deep analysis time only on top-score opportunities.
- For high-payout/high-complexity opportunities:
  - run pre-mortem before go-decision.

## Anti-Patterns

- Confusing “interesting” with “winnable.”
- Underestimating packaging and submission overhead.
- Treating unclear judging criteria as acceptable.
- Ignoring reviewer expectations for reproducibility.

## KPIs

- `% go decisions that result in on-time submissions`.
- `% no-go decisions later proven correct`.
- Estimation error (predicted vs actual effort).
- Risk realization rate by category.
- Time-to-decision.

## Definition of Done

Feasibility stage is complete when:

- Clear decision is published.
- Scope and acceptance criteria are measurable.
- Effort includes buffer and confidence.
- Risks have owners and mitigations.
