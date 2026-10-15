# BIS AI Assistant — Security Setup

This project is a public, anonymous web assistant. No single control makes a public website immune to abuse. Use the controls below together.

## Enabled in the Worker code

- Cloudflare-native rate limits on `POST /api/ask`: 3 requests per client IP per 10 seconds, plus 10 per client IP per 60 seconds.
- Fail-closed behavior if either rate-limit binding is missing or the limiter itself fails.
- Rejects cross-origin browser requests whose Origin differs from the site origin.
- Requires JSON, caps the request body at 16 KiB, and caps questions at 4,000 characters.
- Adds browser security headers including CSP, frame restrictions, content-type sniffing protection and a restrictive permissions policy.
- Hides provider-specific API failures from public responses; sanitized details stay in Worker logs.
- Reduces the public health endpoint to a simple `{ "ok": true }` response.
- Supports optional Cloudflare Turnstile with server-side Siteverify validation. The token, expected hostname and expected action are checked before Gemini is called.

Important: Cloudflare's native Worker rate-limit counters are enforced per Cloudflare location, not as one global worldwide counter. Treat these limits as a protective first layer, not a guarantee against a distributed botnet. The Turnstile challenge and Google-side quota/key restrictions are also important.

## Turn on Turnstile (recommended)

Turnstile remains optional until the two settings below are configured. It is safe to leave them both absent while preparing the widget.

1. In the Cloudflare dashboard, open Turnstile and create a widget for the exact hostname: `bis-ai-assistant.rishabhlj17.workers.dev`.
2. Copy the widget's **site key** (public) and **secret key** (private). Do not put the secret key in source control, HTML, or a public chat.
3. Open **Workers & Pages → bis-ai-assistant → Settings → Variables and Secrets**.
4. Add a plain text variable named `TURNSTILE_SITE_KEY` with the site key.
5. Add a **Secret** named `TURNSTILE_SECRET_KEY` with the secret key.
6. Deploy the settings together. When both are present, the assistant displays the challenge; the Worker verifies each token with Cloudflare before calling Gemini.

The Worker checks the token's hostname against the request hostname and requires the action `bis_ai_ask`. If only one setting is configured, the request is blocked rather than silently bypassing the challenge.

## Secure the Gemini credential

1. In Google AI Studio / Google Cloud key management, inspect the key used by this Worker.
2. Restrict it to the Gemini / Generative Language API only. Do not use an unrestricted key.
3. Keep `GEMINI_API_KEY` stored as a Cloudflare **Secret** on the Worker. Never place it in frontend JavaScript, a URL, this repository, or a screenshot.
4. Enable available usage/budget alerts and monitor request/quota patterns.
5. If you suspect the key has leaked, create a replacement, update the Worker Secret, verify that it works, then disable the old key and review recent usage.

## Verify after deployment

- Open the public assistant page and confirm it loads.
- If Turnstile is configured, complete the challenge and submit one question.
- Try submitting several questions quickly; the API should return a friendly HTTP 429 response when a limit is reached.
- Check Worker logs for unexpected failures, but never share API keys or full tokens.
- Recheck after any deployment that changes `wrangler.toml`, the Worker entry point, or variables/secrets.

## Limits of the protection

These controls reduce spam, some cross-site request abuse, oversized payloads and casual automated use. They cannot prevent all denial-of-service traffic, credential abuse outside this Worker, or attacks spread across many clients and locations. Keep Google-side key restrictions and quota monitoring enabled, and review Cloudflare logs/analytics periodically.
