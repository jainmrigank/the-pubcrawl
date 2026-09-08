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

## Daily notification campaign

The Worker declares a 12:00 UTC daily Cron and the
`pubcrawl-daily-notifications` Queue, but production dispatch remains inert
until the plain-text `PUSH_ENABLED` binding is explicitly changed from
`false` to `true`. The old GitHub schedules and Render batch sender are not
independent broadcasters.

Provision the Queue and the established VAPID keypair only during an approved
cutover. The notification runtime requires these bindings without putting any
value in source control:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
PUSH_DELIVERY_QUEUE
```

The Cron freezes one deterministic campaign for the IST calendar date, fans
out no more than 50 Queue messages at a time, and stops new delivery attempts
at 18:00 IST. Queue consumers send one recipient at a time with a maximum of
two bounded transient retries. Accepted and uncertain provider outcomes are
never blindly resent. Only 404/410 responses atomically remove a current
subscription.

The same Queue preserves the existing one-time welcome after a person opts in.
That welcome is deduplicated separately and is not gated by `PUSH_ENABLED`;
the switch controls the scheduled daily campaign only.

Before enabling production dispatch, verify the account's Workers, Queue, and
Upstash Free-plan headroom with synthetic recipients, then send one explicitly
approved test notification to a selected test subscription. A successful
provider response is delivery evidence, not proof of when iOS displayed it.
