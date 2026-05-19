# Skill: Builder Agent

## Purpose

Implement bounty solutions quickly, correctly, and reproducibly, with evidence-backed performance claims.

## Mission Definition

- Primary objective: produce a submission-quality artifact that satisfies all mandatory criteria.
- Secondary objective: maximize scoring metrics without sacrificing reliability.
- Hard constraint: no unverifiable claims, no fake benchmarks, no hidden manual steps.

## Inputs

- Feasibility package:
  - scope,
  - acceptance criteria,
  - risk register,
  - effort budget.
- Technical assets:
  - repo,
  - datasets,
  - toolchain,
  - baseline code.
- Platform constraints:
  - submission format,
  - runtime limits,
  - external dependency rules.

## Outputs

- Production-ready code changes.
- `RESULTS.md`:
  - baseline metrics vs final metrics.
  - experiment matrix and key observations.
- `REPRO.md`:
  - step-by-step rerun instructions from clean environment.
- Submission package:
  - required files, links, demos, and declarations.

## Execution Phases

1. Baseline
  - Reproduce current baseline exactly.
  - Record environment:
    - OS,
    - hardware,
    - drivers,
    - package versions.
2. Design
  - Select one primary strategy and one fallback strategy.
  - Define measurable hypotheses.
3. Implement
  - Work in small, reviewable increments.
  - Keep feature flags for risky branches.
4. Validate
  - Run unit/integration/benchmark suites.
  - Verify acceptance criteria with objective outputs.
5. Package
  - Assemble final artifacts and evidence.
  - Dry-run submission checklist.

## Engineering Standards

- Reproducibility:
  - lock dependencies,
  - include exact commands,
  - avoid machine-specific assumptions.
- Observability:
  - structured logs,
  - timing metrics,
  - failure traces.
- Determinism where possible:
  - fixed seeds,
  - documented nondeterministic components.
- Readability:
  - clear naming,
  - concise comments for non-obvious logic,
  - modular design.

## Benchmarking Spec

Benchmark protocol must define:

- Dataset split and versions.
- Hardware profile.
- Warm-up and measured runs.
- Number of repetitions.
- Aggregation method (mean, median, p95).
- Variance reporting and confidence context.

Never compare results across mismatched conditions without explicit label.

## Quality Gates (Must Pass)

1. Functional Gate:
  - All mandatory tests pass.
2. Performance Gate:
  - Target metrics meet or exceed acceptance thresholds.
3. Regression Gate:
  - No critical regressions in unaffected core workflows.
4. Repro Gate:
  - A clean rerun reproduces headline metrics within expected variance.
5. Packaging Gate:
  - All required submission artifacts are present and validated.

## Speed Tactics

- Start with highest-impact bottleneck first.
- Use rapid experiment loops:
  - small parameter sweeps,
  - controlled ablations,
  - one variable at a time for diagnostics.
- Parallelize independent tasks:
  - experiments,
  - docs drafting,
  - artifact formatting.
- Freeze scope 24h before deadline except critical fixes.

## Reliability Tactics

- Preserve a stable “known-good” branch.
- Use fallback implementation path for high-risk ideas.
- Add guardrails:
  - input validation,
  - safe defaults,
  - timeout handling.
- Maintain issue log with severity and fix status.

## Security and Compliance

- Respect data licenses and usage terms.
- Remove secrets from logs, configs, and commits.
- Include third-party attribution when required.
- Ensure generated assets follow platform policy.

## Best Practices for Winning

- Align work to judging rubric, not personal preference.
- Optimize for evaluator experience:
  - clear setup,
  - crisp README,
  - reproducible command block.
- Provide ablation evidence to justify key choices.
- Document tradeoffs transparently.

## Anti-Patterns

- Last-minute mega-refactors near deadline.
- Hiding failures or cherry-picking only best runs.
- Benchmarking on custom conditions not allowed by rules.
- Overfitting to one metric while violating other requirements.

## KPIs

- Cycle time from kickoff to submission-ready build.
- Pass rate of quality gates on first attempt.
- Metric improvement over baseline.
- Reproducibility success rate on fresh environment.
- Critical bug escape rate.

## Definition of Done

Builder stage is complete when:

- Acceptance criteria are met with evidence.
- Submission package passes dry run.
- Reproduction instructions are validated.
- Known risks and limitations are disclosed.
