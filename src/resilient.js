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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/api/ask") {
      return worker.fetch(request, env, ctx);
    }

    let body = {};
    try {
      body = await request.clone().json();
    } catch (_) {
      return worker.fetch(request, env, ctx);
    }

    const question = String(body.question || "").trim();
    if (!question || question.length > 4000) {
      return worker.fetch(request, env, ctx);
    }

    let response = null;
    let failureDetail = "";

    try {
      response = await worker.fetch(request, env, ctx);
      if (response.status < 500) return response;

      let payload = {};
      try {
        payload = await response.json();
      } catch (_) {}

      failureDetail = String(payload.technical_error || payload.answer || "");
    } catch (error) {
      failureDetail = error && error.message ? error.message : "Worker request failed.";
    }

    const diagnostic = summarizeFailure(failureDetail);
    console.error("[BIS AI] AI request failed; returning retrieval fallback. " + safeLogDetail(failureDetail));

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

    return Response.json(
      {
        answer: buildFallbackAnswer(question, sources, diagnostic),
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
    );
  }
};
