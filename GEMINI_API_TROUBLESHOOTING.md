# Gemini API troubleshooting for BIS AI Assistant

The Worker calls Gemini server-side. Keep the `GEMINI_API_KEY` as a Cloudflare Worker secret; never place it in browser code or commit it to this repository.

## API request

The Worker uses the Gemini `generateContent` endpoint and sends the key in the `x-goog-api-key` header. The configured model is `gemini-3.5-flash-lite`, which is listed in Google's current Gemini API model documentation.

## What the diagnostic means

The assistant's fallback response includes a safe provider diagnostic when Gemini fails:

- `MISSING_API_KEY`: the Worker cannot see the `GEMINI_API_KEY` secret. Set it in the Cloudflare Worker secrets/configuration and redeploy.
- `400`: Gemini rejected the request. Inspect its returned message and request configuration.
- `401` or `403`: verify the secret value, key status/restrictions, and API permissions in Google AI Studio.
- `404`: check the model ID and endpoint.
- `429`: check Gemini rate limits and quota.
- `5xx`: retry after checking for an upstream service issue.
- `PROVIDER_ERROR`: inspect the sanitized details shown by the assistant and the Worker logs.

The fallback answer uses curated knowledge-base entries. It is not a replacement for a successful AI response or the current official BIS documentation.

## Safe deployment test

1. Open `/api/health`. `ai_configured: true` only confirms that a non-empty secret is present; it does not prove that the key is valid.
2. Submit a question in `/assistant`.
3. If the fallback appears, use the diagnostic code and sanitized provider message to identify the next action.
4. Never share or paste the actual API key into a chat, issue, screenshot, or source file.

Official references:
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/troubleshooting
