import worker from "./index.js";
import { BIS_KNOWLEDGE } from "./knowledge.js";

const STOP_WORDS = new Set([
  "what", "which", "when", "where", "why", "who", "how", "can", "could",
  "should", "would", "will", "does", "do", "did", "is", "are", "was",
  "were", "be", "been", "being", "the", "a", "an", "and", "or", "for",
  "from", "to", "of", "in", "on", "at", "with", "about", "into", "my",
  "me", "i", "we", "you", "your", "our", "please", "tell", "give", "want",
  "need", "get", "have", "has", "exactly"
]);

function isProjectSource(source) {
  return String(source.title || "").toLowerCase().startsWith("bis ai assistant:");
}

function isOfficialBISSource(source) {
  if (isProjectSource(source)) return false;
  const url = String(source.url || "");
  return /^https:\/\/(www\.)?bis\.gov\.in\//i.test(url) ||
    /^https:\/\/standards\.bis\.gov\.in\//i.test(url);
}

function findRelevantSources(question) {
  const normalized = String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ").filter(function (word) {
    return word.length > 2 && !STOP_WORDS.has(word);
  });

  const ranked = BIS_KNOWLEDGE.map(function (source) {
    const title = String(source.title || "").toLowerCase();
    const keywords = Array.isArray(source.keywords) ? source.keywords.join(" ").toLowerCase() : "";
    const content = String(source.content || "").toLowerCase();
    const fullText = title + " " + keywords + " " + content;
    let score = 0;

    words.forEach(function (word) {
      if (title.split(/\s+/).includes(word)) score += 12;
      else if (title.includes(word)) score += 7;

      if (keywords.split(/[, ]+/).includes(word)) score += 9;
      else if (keywords.includes(word)) score += 4;
      else if (content.includes(word)) score += 2;
    });

    (Array.isArray(source.keywords) ? source.keywords : []).forEach(function (keyword) {
      const phrase = String(keyword).toLowerCase().trim();
      if (phrase.length > 3 && normalized.includes(phrase)) {
        score += phrase.includes(" ") ? 18 : 10;
      }
    });

    if (/licen[cs]/.test(normalized) && /licen[cs]|application|apply online/.test(fullText)) score += 28;
    if (/apply|application|obtain|renew|renewal/.test(normalized) && /apply|application|obtain|renew|renewal/.test(fullText)) score += 8;
    if (/qco|quality control order|compulsory certification/.test(normalized) &&
        /qco|quality control order|compulsory certification/.test(fullText)) score += 24;
    if (/indian standard|standard number|is number|know your standard/.test(normalized) &&
        /indian standard|standard number|know your standard/.test(fullText)) score += 20;

    return { source: source, score: score };
  });

  return ranked
    .filter(function (item) {
      return item.score > 0 && item.source.url && /^https?:\/\//i.test(item.source.url);
    })
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, 5)
    .map(function (item) {
      return item.source;
    });
}

function summarizeFailure(detail) {
  const message = String(detail || "");

  if (/GEMINI_API_KEY.*missing|API key.*missing/i.test(message)) {
    return "Server configuration issue: the GEMINI_API_KEY secret appears to be missing. Add or verify it in the Cloudflare Worker settings.";
  }

  const match = message.match(/Gemini API error\s*\((\d{3})\)/i);
  if (!match) {
    return "AI service request failed. The full error is recorded in the Cloudflare Worker logs.";
  }

  const code = Number(match[1]);
  if (code === 400) {
    return "Gemini API returned HTTP 400: the request was rejected. Check the Worker logs for the detailed API message and request parameters.";
  }
  if (code === 401 || code === 403) {
    return "Gemini API returned HTTP " + code + ": credentials or access were rejected. Check the GEMINI_API_KEY Worker secret, key restrictions, and Google AI Studio project access.";
  }
  if (code === 404) {
    return "Gemini API returned HTTP 404: the model or endpoint could not be found.";
  }
  if (code === 429) {
    return "Gemini API returned HTTP 429: the quota or request rate limit may have been reached.";
  }
  if (code >= 500) {
    return "Gemini API returned HTTP " + code + ": the upstream service reported a server error. Try again later.";
  }
  return "Gemini API returned HTTP " + code + ". Check the Cloudflare Worker logs for the detailed API message.";
}

function excerptFor(source) {
  const text = String(source.content || source.summary || "").replace(/\s+/g, " ").trim();
  if (text.length <= 620) return text;
  const clipped = text.slice(0, 617);
  const lastSpace = clipped.lastIndexOf(" ");
  return clipped.slice(0, lastSpace > 450 ? lastSpace : 617) + "…";
}

function buildFallbackAnswer(question, sources, diagnostic) {
  let answer = "**AI-generated response is temporarily unavailable.** " + diagnostic +
    "\n\nI can still show the closest matches from the curated BIS knowledge base. This is a retrieval-only result, not a complete compliance determination. Exact requirements should be taken from the applicable current official BIS documents.";

  if (!sources.length) {
    answer += "\n\nI could not find a sufficiently relevant entry in the current curated knowledge base for this question. Start with the official [BIS Know Your Standard service](https://www.bis.gov.in/know-your-standard/?lang=en) or the [BIS Product Certification FAQ](https://www.bis.gov.in/product-certification/product-certification-faq/?lang=en).";
    return answer;
  }

  answer += "\n\n**Most relevant retrieved information**";
  sources.slice(0, 3).forEach(function (source, index) {
    answer += "\n\n**" + (index + 1) + ". " + String(source.title || "BIS reference") + "**\n" +
      excerptFor(source) + "\n\n[Open source](" + source.url + ")";
  });

  answer += "\n\nThe retrieved entries above are reference material, not a guarantee that every detail applies to your exact product or situation.";
  return answer;
}

function safeLogDetail(detail) {
  return String(detail || "Unknown error")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 600);
}


function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-DNS-Prefetch-Control", "off");
  // Prevent browsers and intermediary caches from retaining HTML, API answers, or error payloads.
  headers.set("Cache-Control", "no-store");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  );
  if (new URL(response.url || "https://invalid.local").pathname.startsWith("/api/")) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonError(message, status, extraHeaders = {}) {
  return Response.json(
    { answer: message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...extraHeaders
      }
    }
  );
}

async function readJsonLimited(request, maximumBytes) {
  if (!request.body) throw new Error("EMPTY_BODY");
  const reader = request.clone().body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(result.value);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    throw new Error("INVALID_JSON");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Safe temporary diagnostic: verify runtime bindings after dashboard key updates; never return key values.
    if (request.method === "GET" && url.pathname === "/api/turnstile-status") {
      return withSecurityHeaders(Response.json({
        siteKeyConfigured: Boolean(env.TURNSTILE_SITE_KEY),
        secretConfigured: Boolean(env.TURNSTILE_SECRET_KEY)
      }, { headers: { "cache-control": "no-store" } }));
    }

    if (request.method !== "POST" || url.pathname !== "/api/ask") {
      try {
        return withSecurityHeaders(await worker.fetch(request, env, ctx));
      } catch (error) {
        console.error("[BIS AI] Request failed: " + safeLogDetail(error?.message || "Unknown error"));
        return withSecurityHeaders(new Response("Internal server error", {
          status: 500,
          headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" }
        }));
      }
    }

    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return withSecurityHeaders(jsonError("Cross-origin requests are not allowed.", 403));
    }

    const clientIp = (request.headers.get("CF-Connecting-IP") || "unknown").slice(0, 100);

    // Fail closed: a missing rate-limit binding must not leave the billable AI endpoint open.
    if (
      !env.API_LIMITER || typeof env.API_LIMITER.limit !== "function" ||
      !env.API_BURST_LIMITER || typeof env.API_BURST_LIMITER.limit !== "function"
    ) {
      console.error("[BIS AI] One or more rate-limit bindings are missing; request blocked.");
      return withSecurityHeaders(jsonError("The assistant is temporarily unavailable because its security limiter is not configured.", 503));
    }

    try {
      const burst = await env.API_BURST_LIMITER.limit({ key: clientIp });
      if (!burst.success) {
        return withSecurityHeaders(jsonError(
          "You are sending questions too quickly. Please wait a few seconds and try again.",
          429,
          { "Retry-After": "10" }
        ));
      }

      const limit = await env.API_LIMITER.limit({ key: clientIp });
      if (!limit.success) {
        return withSecurityHeaders(jsonError(
          "Too many questions were submitted from this network. Please wait a minute before trying again.",
          429,
          { "Retry-After": "60" }
        ));
      }
    } catch (error) {
      console.error("[BIS AI] Rate limiter failed; request blocked.");
      return withSecurityHeaders(jsonError("The assistant is temporarily unavailable because a security check failed.", 503));
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
      return withSecurityHeaders(jsonError("Please submit the question as JSON.", 415));
    }

    const length = Number(request.headers.get("Content-Length") || 0);
    if (Number.isFinite(length) && length > 16384) {
      return withSecurityHeaders(jsonError("The request is too large. Please shorten your question.", 413));
    }

    let body;
    try {
      body = await readJsonLimited(request, 16384);
    } catch (error) {
      if (error?.message === "BODY_TOO_LARGE") {
        return withSecurityHeaders(jsonError("The request is too large. Please shorten your question.", 413));
      }
      return withSecurityHeaders(jsonError("The request body must be valid JSON.", 400));
    }

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return withSecurityHeaders(jsonError("Please enter a question first.", 400));
    }
    if (question.length > 4000) {
      return withSecurityHeaders(jsonError("Please keep your question below 4000 characters.", 400));
    }

    const hasTurnstileSiteKey = Boolean(env.TURNSTILE_SITE_KEY);
    const hasTurnstileSecret = Boolean(env.TURNSTILE_SECRET_KEY);
    if (hasTurnstileSiteKey !== hasTurnstileSecret) {
      console.error("[BIS AI] Turnstile is partially configured; request blocked.");
      return withSecurityHeaders(jsonError("The security check is not fully configured. Please try again later.", 503));
    }

    if (hasTurnstileSecret && hasTurnstileSiteKey) {
      const token = typeof body.turnstile_token === "string" ? body.turnstile_token.trim() : "";
      if (!token || token.length > 2048) {
        return withSecurityHeaders(jsonError("Complete the security check before submitting your question.", 403));
      }

      let verification;
      try {
        const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            secret: env.TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: clientIp === "unknown" ? undefined : clientIp
          }),
          signal: AbortSignal.timeout(5000)
        });

        if (!verifyResponse.ok) {
          console.error("[BIS AI] Turnstile verification service returned a non-success status.");
          return withSecurityHeaders(jsonError("The security check is temporarily unavailable. Please try again shortly.", 503));
        }

        verification = await verifyResponse.json();
      } catch (_) {
        console.error("[BIS AI] Turnstile verification request failed.");
        return withSecurityHeaders(jsonError("The security check is temporarily unavailable. Please try again shortly.", 503));
      }

      if (
        !verification?.success ||
        verification.hostname !== url.hostname ||
        verification.action !== "bis_ai_ask"
      ) {
        return withSecurityHeaders(jsonError("Security verification failed. Refresh the page and complete the check again.", 403));
      }
    }

    let failureDetail = "";
    try {
      const response = await worker.fetch(request, env, ctx);
      if (response.status < 500) return withSecurityHeaders(response);

      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      failureDetail = String(payload.technical_error || payload.answer || "");
    } catch (error) {
      failureDetail = error && error.message ? error.message : "Worker request failed.";
    }

    const safeDetail = safeLogDetail(failureDetail);
    console.error("[BIS AI] AI request failed; retrieval fallback. " + safeDetail);

    const sources = findRelevantSources(question);
    const officialSources = sources
      .filter(isOfficialBISSource)
      .map(function (source) {
        return { title: source.title, url: source.url };
      });
    const projectSources = sources
      .filter(function (source) {
        return !isOfficialBISSource(source);
      })
      .map(function (source) {
        return { title: source.title, url: source.url };
      });

    // Do not expose raw upstream diagnostics to public callers.
    const publicDiagnostic = "The AI response is temporarily unavailable. Showing relevant material from the curated BIS knowledge base instead.";

    return withSecurityHeaders(Response.json(
      {
        answer: buildFallbackAnswer(question, sources, publicDiagnostic),
        sources: officialSources,
        project_sources: projectSources,
        fallback: true
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-bis-ai-fallback": "1"
        }
      }
    ));
  }
};
