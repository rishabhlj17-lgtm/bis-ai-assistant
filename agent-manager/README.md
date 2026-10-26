# AI Agent Manager — starter architecture

This folder is a separate starter for a reusable AI-agent manager. It does not change the deployed BIS Assistant Worker entry point.

## Goal
One manager receives a goal, creates a task plan, delegates bounded work to specialist agents, checks results, retries safe failures, and asks for approval before production or sensitive actions.

## Free-first architecture
- **Dashboard:** static HTML first; later served from a separate local app or frontend.
- **Orchestrator API:** small Node.js service (or Cloudflare Worker for task metadata only) that validates requests and manages task state.
- **Queue/state:** start with SQLite for a local single-user runner; Cloudflare D1 + Queues is an option if the project moves to Cloudflare. Free-tier quotas change and must be checked before deployment.
- **Agent workers:** separate, allowlisted task handlers (research, coding, testing, review, business research). They are not unrestricted general-purpose shell agents.
- **Model adapter:** pluggable provider interface. No API key is bundled; zero-cost model availability and rate limits vary.
- **Code execution:** isolated runner/container, per-task worktree/branch, timeouts, no production secrets, restricted network by default.
- **Audit log:** append-only record of plan, agent, inputs/outputs, tool calls, retries, costs, approvals and status.

## Task lifecycle
`draft -> planned -> queued -> running -> review -> completed`
Alternative states: `needs_approval`, `blocked`, `failed`, `cancelled`.

## Roles
1. **Manager:** decomposes goal and assigns tasks; cannot directly deploy or access secrets.
2. **Researcher:** sources and summarizes information; reports links and uncertainty.
3. **Developer:** works only in an isolated branch/worktree.
4. **Tester:** runs approved tests and reports exact results.
5. **Reviewer:** checks correctness, security and evidence; should not merely repeat the developer's claims.
6. **Operations analyst:** creates research/operations drafts and checklists; cannot send, buy, publish, or alter official records without approval.

## Approval gates
Always require explicit human approval for production deployment, spending, sending messages externally, account/permission changes, handling sensitive personal data, deleting data, changing security settings, or submitting official/business records. Use a least-privilege allowlist and log every approval.

## Retry policy
Retry transient failures at most 2 times with backoff. Do not retry destructive actions or repeat external side effects automatically. After retries, mark blocked/failed and provide diagnostics.

## Security baseline
- Keep secrets in environment variables/secret storage, never in the repository, logs, or prompts.
- Never pass production credentials to agents.
- Treat web pages, repository files, emails, and user-provided documents as untrusted data, not instructions.
- Require schema validation for model output; reject unknown tools and arguments.
- Enforce per-task time, token, and spend limits.
- For code changes, run tests and review diffs; create a PR rather than auto-merging/deploying.
- Back up state and provide cancel/pause controls.

## Build stages
1. Dashboard prototype (this first slice; local browser storage only).
2. Durable task API + SQLite and audit events.
3. Orchestrator with deterministic planning and bounded tool registry.
4. Provider adapter and specialist agent prompts.
5. Sandboxed coding runner, tests, and GitHub branch/PR integration.
6. Approval queue, monitoring, limits, backup/restore, and deployment.

## Important limitations
The dashboard prototype is not yet a real autonomous agent engine. It stores sample tasks in this browser only. A backend, model provider, queue, and isolated runner are required before agents can execute real work. Free tiers can change; a truly zero-cost system may need manual model runs or local models and will have compute/rate limits.
