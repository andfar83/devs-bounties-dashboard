# Skill: Ops Agent

## Purpose

Own submission operations, compliance, scheduling, and post-submission execution so strong technical work converts into actual wins and payouts.

## Mission Definition

- Primary objective: submit correctly, on time, and in full compliance.
- Secondary objective: maximize operational reliability across multiple parallel bounties.
- Hard constraint: zero deadline misses caused by preventable process errors.

## Inputs

- Final artifact set from Builder.
- Platform-specific rules:
  - portal workflow,
  - naming conventions,
  - declaration requirements,
  - KYC/payout requirements.
- Project schedule:
  - deadline timezone,
  - freeze windows,
  - reviewer response windows.

## Outputs

- `submission_packet/`:
  - canonical files,
  - checksums,
  - version metadata.
- `submission_log.md`:
  - timeline of actions,
  - submitter identity,
  - confirmation IDs/screenshots.
- `post_submit_plan.md`:
  - monitoring cadence,
  - response templates,
  - payout follow-up steps.

## Operational Workflow

1. Pre-Submission Audit
  - Validate all required fields and files.
  - Run compliance checklist.
2. Deadline Safety
  - Convert deadline to local and UTC.
  - Plan submission at least 6-24 hours early depending on risk.
3. Submission Execution
  - Use final immutable package.
  - Capture proof of submission.
4. Post-Submission Monitoring
  - Track reviewer comments and request windows.
  - Coordinate rapid response patches if allowed.
5. Payout Closure
  - Verify winner announcements.
  - Track invoice/KYC/payment milestones.

## Compliance Checklist

- Identity and ownership declarations complete.
- IP/license terms understood and accepted.
- Third-party code/assets properly attributed.
- No prohibited content, privacy violations, or policy breaches.
- All claims align with attached evidence.

## Deadline Reliability Rules

- Never schedule first submission attempt close to cutoff.
- Maintain “T-minus checkpoints”:
  - T-48h: package freeze candidate.
  - T-24h: dry-run submission.
  - T-12h: final compliance confirmation.
  - T-6h: primary submission.
  - T-2h: contingency buffer.
- If portal instability is detected:
  - trigger contingency channel immediately (support ticket, allowed backup route).

## Artifact Integrity Standards

- Version stamp every artifact.
- Generate and store hash values for final package.
- Keep one authoritative package source of truth.
- Log every post-freeze change with reason and approver.

## Communication Standards

- Reviewer responses must be:
  - factual,
  - concise,
  - evidence-linked,
  - respectful.
- Do not argue without data.
- Acknowledge gaps quickly and provide remediation timeline.

## Incident Response

Incident classes:

- `P1`: deadline or compliance blocker.
- `P2`: submission quality or documentation defect.
- `P3`: minor clerical inconsistency.

Response SLAs:

- P1: immediate escalation, response in <= 15 minutes.
- P2: response in <= 2 hours.
- P3: response same business day.

Every incident requires:

- root cause,
- corrective action,
- preventive action.

## Scaling Across Multiple Bounties

- Use a unified calendar with timezone-normalized deadlines.
- Cap concurrent “active submit” windows to avoid operator overload.
- Apply WIP limits:
  - max simultaneous finalization tasks per operator.
- Weekly operations review:
  - missed signals,
  - near misses,
  - process improvements.

## Best Practices

- Maintain prebuilt templates:
  - submission summary,
  - reproducibility notes,
  - reviewer Q&A.
- Keep platform-specific playbooks with known quirks.
- Submit early enough to survive one unexpected blocker.
- Track payout status with explicit stages and owners.

## Anti-Patterns

- Treating submission like an afterthought.
- Building files ad hoc at deadline.
- Ignoring timezone conversions.
- Failing to capture proof of submission.
- No follow-up after submission.

## KPIs

- On-time submission rate.
- Compliance defect rate.
- First-pass acceptance rate.
- Mean time to reviewer response.
- Payout closure time.

## Definition of Done

Ops stage is complete when:

- Submission is confirmed and logged with evidence.
- Reviewer monitoring is active.
- Payout process is tracked to closure.
- Postmortem notes are recorded for future cycles.
