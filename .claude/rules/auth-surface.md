---
paths:
  - "app/api/**/auth/**/*.ts"
  - "app/api/**/oauth/**/*.ts"
  - "app/api/**/*password*/**/*.ts"
  - "app/api/**/*reset*/**/*.ts"
  - "lib/auth.ts"
  - "lib/auth/**/*.ts"
  - "lib/crypto/**/*.ts"
  - "**/*oauth*.ts"
---

# Auth-surface rules (credentials, OAuth, tokens)

Two independent security audits re-discovered the SAME auth gaps from scratch because nothing encoded the baseline. Before shipping any change under auth / OAuth / password / token-storage code, confirm all three — they recur:

- **Rate-limit every credential-mutating endpoint.** Password reset / forgot / change and sign-in must go through the rate limiter. An unlimited reset/forgot endpoint is a brute-force + enumeration vector.
- **Every OAuth callback validates a signed `state` parameter (CSRF).** Mint `state` at redirect time, verify it on callback before exchanging the code. **GitHub OAuth specifically** has historically shipped without state validation — check it.
- **Stored third-party tokens/secrets use AES-256-GCM, never a plaintext column.** Use the `lib/crypto/api-key.ts` helper (the established pattern for other credentials). **GitHub tokens** were the plaintext exception once — don't reintroduce it.

These are cross-file invariants a single lint can't catch — they're a reviewer checklist (pairs with `/code-review ultra` and the `tenant-leak-review` workflow). (distill #7)
