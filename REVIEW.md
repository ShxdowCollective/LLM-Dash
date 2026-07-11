# Review Policy

Guidance for AI code reviewers (Kilo Code Reviews reads this from the base branch).

## Verdict (required)

End every review summary with a single verdict line in exactly this format:

```
VERDICT: SHIP | SHIP WITH FIXES | DON'T SHIP
```

- **SHIP** — no blocking issues; nits at most.
- **SHIP WITH FIXES** — mergeable after the listed fixes; enumerate them as a checklist.
- **DON'T SHIP** — a critical/major issue (correctness, security, data loss) must be resolved and re-reviewed.

## Ratings (required)

Before the verdict, rate each area 1-5 with one line of justification:
Correctness, Security, Tests, Readability, Scope discipline.

## Focus

- Prioritize correctness and security findings over style.
- Flag any change touching auth, secrets, network calls, or CI config as elevated risk.
- Skip generated files, lockfiles, and vendored code.

## Style

- One summary comment; inline comments only for concrete, actionable issues (severity-tagged).
- No praise padding. Findings first.
