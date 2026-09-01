# PubCrawl Worker secrets

The Worker deliberately fails closed for photo identification and drink
generation when `RATE_LIMIT_SALT` is absent. This prevents a predictable value
from being used to hash client addresses. Core browsing, likes, kept recipes,
Quiz, Watch, and Shorts remain available without that secret.

Before a production Worker deployment, set secrets through Wrangler (never in
`wrangler.jsonc`, source files, logs, or screenshots):

```text
npx wrangler secret put KV_REST_API_TOKEN --config worker/wrangler.jsonc
npx wrangler secret put RATE_LIMIT_SALT --config worker/wrangler.jsonc
```

Wrangler prompts for each value without putting it in the command history.
Generate `RATE_LIMIT_SALT` from a cryptographically secure random source with
at least 32 bytes. The same replacement Upstash token must also be installed
in the Render fallback and the GitHub Actions secrets before the old token is
revoked. Verify the Worker health and dynamic routes after each secret update;
never print either value.

Local tests intentionally omit the salt to assert the 503 fail-closed path.
Use a throwaway local value only when explicitly exercising a successful AI
request; it must never be copied to the production binding.
