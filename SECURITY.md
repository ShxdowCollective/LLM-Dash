# Security Policy

## Supported Versions

LLM-Dash ships from `main`; the latest release on the default branch is the
only supported version. Security fixes land there and are published in the next
tagged release.

| Version | Supported |
|---|---|
| Latest release / `main` | Yes |
| Older tagged releases | No |

## Reporting a Vulnerability

Please report security issues **privately** — do not open a public issue for a
suspected vulnerability.

Use GitHub's private reporting: go to the repository's **Security** tab →
**Report a vulnerability** to open a private advisory. This keeps the report
confidential until a fix ships. If private reporting is disabled, open a minimal
public issue asking a maintainer to enable it — do not include exploit details.

Include what you can: affected version/commit, reproduction steps, impact, and
any proof-of-concept. We aim to acknowledge within a few days and will keep you
updated as we triage and fix.

## Scope Notes

LLM-Dash runs locally and binds to `127.0.0.1` by default. The most relevant
security surfaces are:

- **Credential handling** — provider, Exa, and LLM Stats API keys are stored via
  environment, the Voidware credential broker, or the OS keychain, and are never
  written to the repo, logs, or API responses. Reports of keys leaking into any
  of those are in scope.
- **`--host 0.0.0.0` exposure** — binding to a LAN/public interface widens the
  attack surface; treat the dashboard as trusted-network only.
- **Update-run injection** — the agent update contract (`skill/SKILL.md`) fetches
  and parses external content. Issues that let researched content execute or
  corrupt local state are in scope.

Out of scope: vulnerabilities in third-party dependencies (report those
upstream), and risks that require an already-compromised local machine.
