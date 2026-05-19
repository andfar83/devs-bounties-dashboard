# Hybrid Bounty Agent Skills

This project defines a hybrid agent system for bounty work:

1. `scout-agent`: Discover and prioritize opportunities.
2. `feasibility-agent`: Kill bad opportunities early; scope winners.
3. `builder-agent`: Execute, benchmark, and package submissions.
4. `ops-agent`: Handle compliance, deadlines, and delivery operations.
5. `integration-agent`: Connect games to incentive/reward platforms safely and profitably.

## Folder Contract

- Each skill lives at `skills/<skill-name>/SKILL.md`.
- Every `SKILL.md` is self-contained and executable as an operating playbook.
- Inputs and outputs should be machine-readable whenever possible.

## System-Level Workflow

1. Scout produces ranked bounty candidates.
2. Feasibility validates constraints, effort, and risk.
3. Builder executes top opportunities with reproducible artifacts.
4. Integration designs and validates platform reward integrations.
5. Ops ensures compliant submission and post-submission tracking.

## Shared Quality Bar

- Truth-first: no fabricated metrics, logs, or claims.
- Reproducibility: all reported results must be rerunnable.
- Speed with control: optimize cycle time without skipping critical gates.
- Reliability: clear rollback paths, issue escalation, and audit trail.
