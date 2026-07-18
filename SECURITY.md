# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes. Older
versions are not actively maintained.

| Version / Branch | Supported |
|---|---|
| `main` (latest) | Yes |
| Older releases | No |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
Public disclosure before a fix is available puts all users at risk.

To report a vulnerability, send an email to:

**security@simplerdevelopment.com**

Include as much of the following as possible:

- A description of the vulnerability and its potential impact
- The component or area of the codebase affected (e.g. auth, billing, data
  access, MCP tools)
- Steps to reproduce or a proof-of-concept (even a partial one is helpful)
- Any suggested mitigations you have identified

We will acknowledge receipt within **72 hours** and aim to provide an initial
assessment (confirmed / not confirmed, severity, rough timeline) within **7
business days**.

## Coordinated Disclosure

We follow a coordinated disclosure model:

1. Reporter submits the vulnerability privately.
2. We confirm and assess the issue.
3. We develop and test a fix.
4. We release the fix and notify the reporter.
5. Reporter may publish details **30 days** after the fix ships (or sooner by
   mutual agreement).

We appreciate researchers who give us a reasonable window to respond before
going public. If you believe a vulnerability poses immediate, critical risk to
users, please say so in your initial report and we will prioritize accordingly.

## Scope

This policy covers the SimplerDevelopment platform codebase in this repository.
Third-party dependencies are out of scope for this policy — please report those
directly to the upstream project.

## Credits

We are happy to publicly credit researchers who report valid vulnerabilities,
unless you prefer to remain anonymous.
