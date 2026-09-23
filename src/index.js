import { BIS_KNOWLEDGE } from "./knowledge.js";

function retrieveKnowledge(question) {
  const normalized = question
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopWords = new Set([
    "what","which","when","where","why","who","how","can","could","should",
    "would","will","does","do","did","is","are","was","were","be","been",
    "being","the","a","an","and","or","for","from","to","of","in","on",
    "at","with","about","into","my","me","i","we","you","your","our",
    "please","tell","give","want","need","get","have","has"
  ]);

  const words = normalized
    .split(" ")
    .filter(word => word.length > 2 && !stopWords.has(word));

  const scored = BIS_KNOWLEDGE.map(item => {
    const title = item.title.toLowerCase();
    const keywordText = item.keywords.join(" ").toLowerCase();
    const content = item.content.toLowerCase();
    const text = title + " " + keywordText + " " + content;

    let score = 0;

    for (const word of words) {
      if (title.includes(word)) score += 8;
      if (keywordText.includes(word)) score += 5;
      else if (content.includes(word)) score += 2;
    }

    for (const keyword of item.keywords) {
      const phrase = keyword.toLowerCase().trim();
      if (phrase.length > 3 && normalized.includes(phrase)) {
        score += phrase.includes(" ") ? 10 : 7;
      }
    }

    return { ...item, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildGeminiPrompt(question, sources) {
  const context = sources
    .map(
      (source, index) =>
        `[SOURCE ${index + 1}]
Title: ${source.title}
Official URL: ${source.url}
Verified BIS context:
${source.content}`
    )
    .join("\n\n");

  return `
You are BIS AI Assistant, an information assistant for Indian business and product compliance.

Answer the user's question using the verified BIS context supplied below.

IMPORTANT RULES:
1. Do not invent BIS requirements, standards, licence conditions, fees, dates, tests or legal obligations.
2. If the supplied context is insufficient, clearly say that the available BIS knowledge does not contain enough verified information.
3. Preserve official BIS terminology such as Indian Standard, BIS licence, Standard Mark, Quality Control Order (QCO), Scheme of Testing and Inspection and conformity assessment.
4. Explain the answer in simple language.
5. When relevant, tell the user what official BIS page or document they should check next.
6. Never claim that this assistant is officially operated by BIS.
7. Give a concise answer first, followed by useful next steps.
8. Use only the supplied sources for factual BIS claims.

USER QUESTION:
${question}

VERIFIED BIS SOURCES:
${context || "No sufficiently relevant verified source was found."}

Return a clear, useful answer suitable for a normal business user.

RESPONSE QUALITY:
- Do not open with a generic statement such as "the available BIS knowledge does not contain enough information" when one or more supplied sources are relevant.
- First use the supplied sources to give the strongest answer those sources support.
- For compliance/process questions, organize the answer as:
  1. Direct answer
  2. Applicable Indian Standard / scheme / QCO, when supported
  3. Key requirements or tests, when supported
  4. Important conditions or scope limitations
  5. Official BIS source links
- Clearly distinguish between mandatory requirements and general guidance when the supplied source supports that distinction.
- Never turn a source gap into a guessed requirement.
- If a specific detail is not supported, say exactly which detail is not established by the supplied sources, while still answering the rest of the question.
- Do not repeatedly tell the user to "verify" instead of answering. Give the supported answer first and show the official source beside it.
- Do not add a repetitive "I am an independent AI assistant" sentence to every generated answer; the website already displays the independent-project notice.

`;
}


async function askGemini(question, sources, apiKey) {
  const prompt = buildGeminiPrompt(question, sources);

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
    encodeURIComponent(apiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200
      }
    })
  });

  const raw = await response.text();
  let data = null;

  try {
    data = JSON.parse(raw);
  } catch (_) {}

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status ||
      response.statusText ||
      "Unknown Gemini API error";

    throw new Error(
      "Gemini API error (" + response.status + "): " + message
    );
  }

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim() || "";

  if (!answer) {
    throw new Error("Gemini returned an empty answer.");
  }

  return answer;
}

function htmlPage(mode) {
  const assistantMode = mode === "assistant";
  const activeHome = assistantMode ? "" : "active";
  const activeAssistant = assistantMode ? "active" : "";

  const mainContent = assistantMode
    ? '<div class="breadcrumb">Home / AI Assistant</div>' +
      '<div class="assistant-layout">' +
        '<aside class="sidebar">' +
          '<div class="sidebar-title">BIS Services</div>' +
          '<a href="https://www.bis.gov.in/know-your-standard/?lang=en" target="_blank" rel="noopener">Know Your Standard</a>' +
          '<a href="https://www.bis.gov.in/apply-for-a-license/?lang=en" target="_blank" rel="noopener">Apply For Licence</a>' +
          '<a href="https://www.bis.gov.in/product-certification/product-certification-process/?lang=en" target="_blank" rel="noopener">Certification Process</a>' +
          '<a href="https://www.bis.gov.in/product-certification/products-under-compulsory-certification/?lang=en" target="_blank" rel="noopener">Compulsory Certification</a>' +
          '<a href="https://www.bis.gov.in/product-certification/product-specific-information-2/?lang=en" target="_blank" rel="noopener">Product Specific Information</a>' +
          '<a href="https://standards.bis.gov.in/" target="_blank" rel="noopener">Standards Portal</a>' +
        '</aside>' +
        '<section class="assistant-card">' +
          '<div class="assistant-head">' +
            '<h1>BIS AI Assistant</h1>' +
            '<p>Ask about Indian Standards, BIS certification, licensing, QCOs, testing, product-specific requirements and related BIS services.</p>' +
          '</div>' +
          '<div class="assistant-body">' +
            '<label class="question-label" for="question">Ask your BIS question</label>' +
            '<textarea id="question" placeholder="Example: How can I find the Indian Standard applicable to my product?"></textarea>' +
            '<button id="askButton" class="ask" type="button"><span id="askText">Ask BIS AI Assistant</span><span id="spinner" class="spinner" aria-hidden="true"></span></button>' +
            '<div class="examples">' +
              '<div class="examples-title">Suggested searches</div>' +
              '<button type="button" class="example" data-example="What is BIS product certification?">What is BIS product certification?</button>' +
              '<button type="button" class="example" data-example="How can a manufacturer apply for a BIS licence?">How do I apply for a BIS licence?</button>' +
              '<button type="button" class="example" data-example="How can I find the Indian Standard applicable to my product?">Find my Indian Standard</button>' +
            '</div>' +
            '<div id="answer" class="answer" aria-live="polite">Your answer will appear here.</div>' +
            '<div id="status" class="status" aria-live="polite"></div>' +
            '<div id="sources" class="sources"></div>' +
            '<div class="note">This is an independent project using a curated BIS knowledge layer and Gemini AI. It is not an official BIS product or endorsement.</div>' +
          '</div>' +
        '</section>' +
      '</div>'
    : '<div class="breadcrumb">Home</div>' +
      '<div class="hero">' +
        '<section class="hero-main">' +
          '<h1>Making Quality a Way of Life</h1>' +
          '<p>Bureau of Indian Standards develops and publishes Indian Standards, implements conformity assessment schemes, supports laboratories and works for consumer empowerment.</p>' +
          '<a class="hero-btn" href="/assistant">Open BIS AI Assistant</a>' +
        '</section>' +
        '<aside class="news">' +
          '<h3>NEWS AND UPDATES</h3>' +
          '<div class="news-item">Explore BIS standards, certification and quality initiatives.</div>' +
          '<div class="news-item">Use Know Your Standard to find standards by IS number or keyword.</div>' +
          '<div class="news-item">Check official BIS certification guidance before taking compliance decisions.</div>' +
          '<div class="news-item">Visit the official BIS website for current notices and services.</div>' +
        '</aside>' +
      '</div>' +
      '<h2 class="section-title">BIS Services</h2>' +
      '<div class="services">' +
        '<a class="service" href="https://standards.bis.gov.in/" target="_blank" rel="noopener"><strong>Standardization</strong><span>Indian Standards and technical information.</span></a>' +
        '<a class="service" href="https://www.bis.gov.in/product-certification/?lang=en" target="_blank" rel="noopener"><strong>Product Certification</strong><span>Certification, licensing and related processes.</span></a>' +
        '<a class="service" href="https://www.bis.gov.in/product-certification/products-under-compulsory-certification/?lang=en" target="_blank" rel="noopener"><strong>Compulsory Certification</strong><span>Products covered by mandatory requirements and QCOs.</span></a>' +
        '<a class="service" href="/assistant"><strong>BIS AI Assistant</strong><span>Natural-language help for discovering BIS information.</span></a>' +
      '</div>';

  return '<!doctype html>' +
  '<html lang="en">' +
  '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>BIS AI Assistant</title>' +
    '<style>' +
      '*{box-sizing:border-box}' +
      'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#fff}' +
      'a{color:inherit}' +
      '.topbar{background:#f2f2f2;border-bottom:1px solid #d8d8d8;font-size:12px;color:#555}' +
      '.topbar-inner{max-width:1240px;margin:auto;padding:7px 18px;display:flex;justify-content:space-between;align-items:center;gap:15px}' +
      '.toplinks{display:flex;gap:16px;flex-wrap:wrap}.toplinks a{text-decoration:none}.gov{font-weight:600}' +
      '.header{background:#fff;border-bottom:3px solid #0a4b84}' +
      '.header-inner{max-width:1240px;margin:auto;padding:16px 18px 14px;display:flex;justify-content:space-between;align-items:center;gap:20px}' +
      '.brand{display:flex;align-items:center;gap:14px;text-decoration:none}' +
      '.logo-mark{width:58px;height:58px;border-radius:50%;border:4px solid #0b4d86;display:flex;align-items:center;justify-content:center;color:#0b4d86;font-weight:800;font-size:21px;position:relative}' +
      '.logo-mark:after{content:"";position:absolute;width:28px;height:28px;border-radius:50%;border:2px solid #c9951b}' +
      '.brand-title{color:#123f6d;font-size:24px;font-weight:700;line-height:1.1}.brand-subtitle{color:#555;font-size:12px;margin-top:5px}' +
      '.ebis{text-align:right;color:#0b4d86;font-size:13px;font-weight:700}.ebis small{display:block;color:#777;font-weight:400;margin-top:3px}' +
      '.nav{background:#0b4d86;color:#fff}.nav-inner{max-width:1240px;margin:auto;padding:0 18px;display:flex;flex-wrap:wrap}' +
      '.nav a{padding:13px 15px;text-decoration:none;font-size:13px;border-right:1px solid #286597}.nav a:hover,.nav a.active{background:#083a66}' +
      '.notice{background:#fff8df;border-bottom:1px solid #ead58c;color:#6b5a1f;font-size:12px;text-align:center;padding:7px 12px}' +
      '.container{max-width:1240px;margin:0 auto;padding:24px 18px 42px}.breadcrumb{font-size:12px;color:#777;margin-bottom:16px}' +
      '.hero{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:22px}.hero-main{min-height:250px;padding:34px;background:linear-gradient(120deg,#0b4d86,#1168a5);color:#fff}.hero-main h1{margin:0 0 12px;font-size:34px}.hero-main p{max-width:690px;line-height:1.65}' +
      '.hero-btn{display:inline-block;margin-top:12px;background:#d39b19;padding:11px 16px;text-decoration:none;font-weight:700}' +
      '.news{border:1px solid #d7d7d7;background:#fff}.news h3{margin:0;padding:12px 15px;background:#0b4d86;color:#fff;font-size:16px}.news-item{padding:12px 14px;border-bottom:1px solid #e8e8e8;font-size:13px;line-height:1.45}' +
      '.section-title{color:#0b4d86;font-size:21px;font-weight:700;margin:25px 0 12px;border-bottom:2px solid #d39b19;padding-bottom:7px}' +
      '.services{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.service{min-height:108px;padding:17px;border:1px solid #d9dee5;background:#f7fafc;text-decoration:none}.service strong{display:block;color:#0b4d86;font-size:15px;margin-bottom:7px}.service span{font-size:12px;color:#606b78;line-height:1.4}' +
      '.assistant-layout{display:grid;grid-template-columns:270px 1fr;gap:20px}.sidebar{border:1px solid #d9dee5;background:#f6f8fa;height:max-content}.sidebar-title{background:#0b4d86;color:#fff;padding:13px 14px;font-size:15px;font-weight:700}.sidebar a{display:block;padding:11px 13px;border-bottom:1px solid #e2e5e8;text-decoration:none;font-size:13px}.sidebar a:hover{background:#e9f0f6}' +
      '.assistant-card{border:1px solid #d0d8e0;box-shadow:0 2px 8px rgba(0,0,0,.08);background:#fff}.assistant-head{padding:20px 22px;background:#f3f7fb;border-bottom:1px solid #d7e0e8}.assistant-head h1{margin:0;color:#0b4d86;font-size:28px}.assistant-head p{margin:8px 0 0;color:#5f6975;line-height:1.55}.assistant-body{padding:22px}' +
      '.question-label{display:block;color:#0b4d86;font-size:14px;font-weight:700;margin-bottom:8px}' +
      'textarea{width:100%;min-height:150px;border:1px solid #aeb9c5;padding:14px;font-size:15px;font-family:Arial,Helvetica,sans-serif;resize:vertical}textarea:focus{outline:none;border-color:#0b4d86;box-shadow:0 0 0 2px rgba(11,77,134,.12)}' +
      '.ask{margin-top:12px;background:#0b4d86;border:0;color:#fff;padding:12px 20px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:10px;min-width:205px;justify-content:center}.ask:hover{background:#083a66}.ask:disabled{opacity:.7;cursor:wait}' +
      '.spinner{display:none;width:15px;height:15px;border:2px solid rgba(255,255,255,.5);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}.ask.loading .spinner{display:inline-block}@keyframes spin{to{transform:rotate(360deg)}}' +
      '.examples{margin:18px 0 0;color:#687481;font-size:12px}.examples-title{font-weight:700;color:#425466;margin-bottom:4px}.example{display:inline-block;margin:5px 5px 0 0;padding:7px 9px;background:#edf3f8;border:1px solid #d4e0ea;color:#24577f;cursor:pointer}.example:hover{background:#dfeaf3}' +
      '.answer{margin-top:20px;background:#f8fafc;border:1px solid #dce3ea;padding:16px;min-height:90px;line-height:1.65}.answer a{color:#0b4d86;text-decoration:underline;font-weight:600}.answer strong{color:#172f4a}.md-step{margin:7px 0 0 4px}.md-number{font-weight:700;color:#0b4d86}.md-bullet{margin:6px 0 0 8px}.md-gap{height:8px}' +
      '.sources{margin-top:18px}.sources h3{color:#0b4d86;font-size:16px;margin:0 0 8px}.source{padding:10px 12px;border:1px solid #dde3e8;margin-top:8px;background:#fff}.source a{color:#0b4d86;font-weight:700;text-decoration:none}.source a:hover{text-decoration:underline}' +
      '.status{margin-top:10px;font-size:12px;color:#6a7480;line-height:1.45}.note{margin-top:18px;font-size:12px;color:#6a7480;line-height:1.5}' +
      '.footer{background:#123f6d;color:#fff;margin-top:30px}.footer-inner{max-width:1240px;margin:auto;padding:28px 18px;display:grid;grid-template-columns:2fr 1fr 1fr;gap:24px}.footer h4{margin:0 0 9px;font-size:14px}.footer p,.footer a{font-size:12px;line-height:1.55;color:#e3ebf3}.footer a{text-decoration:none;display:block}.disclaimer{background:#0c2f50;color:#dce8f3;padding:9px 18px;text-align:center;font-size:11px}' +
      '@media(max-width:900px){.hero,.assistant-layout{grid-template-columns:1fr}.services{grid-template-columns:repeat(2,1fr)}.footer-inner{grid-template-columns:1fr}}' +
      '@media(max-width:560px){.header-inner{align-items:flex-start}.ebis{display:none}.services{grid-template-columns:1fr}.nav a{padding:10px 11px}.hero-main{padding:24px}.hero-main h1{font-size:28px}}' +
    '</style>' +
  '</head>' +
  '<body>' +
    '<div class="topbar"><div class="topbar-inner"><div class="gov">Government of India</div><div class="toplinks"><a href="https://www.bis.gov.in/" target="_blank" rel="noopener">Official BIS Website</a><a href="https://www.bis.gov.in/contact-us/?lang=en" target="_blank" rel="noopener">Contact Us</a></div></div></div>' +
    '<header class="header"><div class="header-inner">' +
      '<a class="brand" href="/"><div class="logo-mark">BIS</div><div><div class="brand-title">Bureau of Indian Standards</div><div class="brand-subtitle">The National Standards Body of India</div></div></a>' +
      '<div class="ebis">eBIS<small>Electronic BIS Services</small></div>' +
    '</div>' +
    '<nav class="nav"><div class="nav-inner">' +
      '<a href="/" class="' + activeHome + '">Home</a>' +
      '<a href="https://www.bis.gov.in/the-bureau/?lang=en" target="_blank" rel="noopener">The Bureau</a>' +
      '<a href="https://www.bis.gov.in/standards/?lang=en" target="_blank" rel="noopener">Standards</a>' +
      '<a href="https://www.bis.gov.in/product-certification/?lang=en" target="_blank" rel="noopener">Product Certification</a>' +
      '<a href="https://www.bis.gov.in/system-certification-overview/?lang=en" target="_blank" rel="noopener">System Certification</a>' +
      '<a href="https://www.bis.gov.in/training-services/?lang=en" target="_blank" rel="noopener">Training</a>' +
      '<a href="https://www.bis.gov.in/consumer-affairs/?lang=en" target="_blank" rel="noopener">Consumer Affairs</a>' +
      '<a href="/assistant" class="' + activeAssistant + '">AI Assistant</a>' +
    '</div></nav></header>' +
    '<div class="notice">Independent BIS AI Assistant prototype — verify important compliance information on current official BIS sources.</div>' +
    '<main id="main" class="container">' + mainContent + '</main>' +
    '<footer class="footer"><div class="footer-inner">' +
      '<div><h4>Bureau of Indian Standards</h4><p>Manak Bhawan, 9 Bahadur Shah Zafar Marg, New Delhi - 110002, India</p><p>Independent project interface styled after the BIS public website.</p></div>' +
      '<div><h4>Quick Links</h4><a href="https://www.bis.gov.in/" target="_blank" rel="noopener">Official BIS Website</a><a href="https://standards.bis.gov.in/" target="_blank" rel="noopener">Standards Portal</a><a href="/assistant">BIS AI Assistant</a></div>' +
      '<div><h4>Verification</h4><p>Verify current standards, notices and regulatory requirements using official BIS sources.</p></div>' +
    '</div><div class="disclaimer">BIS AI Assistant — independent prototype, not an official BIS service.</div></footer>' +
    '<script>' +
      'function escapeHtml(value){return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll(String.fromCharCode(34),"&quot;").replaceAll("\'","&#39;");}' +
      'function renderMarkdown(markdown){' +
        'let html=escapeHtml(markdown||"");' +
        'html=html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g,"<a href=\\"$2\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">$1</a>");' +
        'html=html.replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>");' +
        'html=html.replace(/^\\s*(\\d+)\\.\\s+(.+)$/gm,"<div class=\\"md-step\\"><span class=\\"md-number\\">$1.</span> $2</div>");' +
        'html=html.replace(/^\\s*[-•]\\s+(.+)$/gm,"<div class=\\"md-bullet\\">• $1</div>");' +
        'html=html.replace(/\\n{2,}/g,"<div class=\\"md-gap\\"></div>");' +
        'html=html.replace(/\\n/g,"<br>");' +
        'return html;' +
      '}' +
      'const question=document.getElementById("question");' +
      'const askButton=document.getElementById("askButton");' +
      'const askText=document.getElementById("askText");' +
      'const answer=document.getElementById("answer");' +
      'const status=document.getElementById("status");' +
      'const sources=document.getElementById("sources");' +
      'if(askButton){' +
        'askButton.addEventListener("click",ask);' +
        'document.querySelectorAll("[data-example]").forEach(function(btn){btn.addEventListener("click",function(){question.value=btn.getAttribute("data-example");question.focus();status.textContent="Suggested question selected. Click Ask BIS AI Assistant.";});});' +
        'question.addEventListener("keydown",function(event){if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){ask();}});' +
      '}' +
      'async function ask(){' +
        'const text=question.value.trim();' +
        'if(!text){answer.textContent="Please enter a BIS question first.";status.textContent="";question.focus();return;}' +
        'askButton.disabled=true;askButton.classList.add("loading");askText.textContent="Searching BIS information...";answer.textContent="Searching verified BIS information and preparing your answer...";status.textContent="Connecting to the AI service...";sources.innerHTML="";' +
        'try{' +
          'const response=await fetch("/api/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text})});' +
          'const data=await response.json().catch(function(){return {};});' +
          'if(!response.ok){throw new Error(data.answer||("Request failed with HTTP "+response.status));}' +
          'answer.innerHTML=renderMarkdown(data.answer||"No answer available.");status.textContent="Answer generated from the available verified BIS knowledge.";'+
          'if(data.sources&&data.sources.length){sources.innerHTML="<h3>Official BIS sources</h3>";data.sources.forEach(function(source){const div=document.createElement("div");div.className="source";const link=document.createElement("a");link.href=source.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=source.title;div.appendChild(link);sources.appendChild(div);});}' +
        '}catch(error){answer.textContent="The AI service could not complete this request.";status.textContent=error&&error.message?error.message:"Please try again.";}finally{askButton.disabled=false;askButton.classList.remove("loading");askText.textContent="Ask BIS AI Assistant";}' +
      '}' +
    '</script>' +
  '</body>' +
  '</html>';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/assistant")
    ) {
      return new Response(
        htmlPage(url.pathname === "/assistant" ? "assistant" : "home"),
        {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "cache-control": "no-store"
          }
        }
      );
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        ai_configured: Boolean(env.GEMINI_API_KEY),
        knowledge_sources: BIS_KNOWLEDGE.length
      });
    }

    if (request.method === "POST" && url.pathname === "/api/ask") {
      try {
        const body = await request.json();
        const question = String(body.question || "").trim();

        if (!question) {
          return Response.json(
            { answer: "Please enter a question." },
            { status: 400 }
          );
        }

        if (question.length > 4000) {
          return Response.json(
            { answer: "Please keep your question below 4000 characters." },
            { status: 400 }
          );
        }

        const sources = retrieveKnowledge(question);

        if (!env.GEMINI_API_KEY) {
          return Response.json(
            {
              answer:
                "The AI service is not configured on the server. The site itself is working, but GEMINI_API_KEY is missing."
            },
            { status: 500 }
          );
        }

        const answer = await askGemini(
          question,
          sources,
          env.GEMINI_API_KEY
        );

        return Response.json({
          answer,
          sources: sources.map(source => ({
            title: source.title,
            url: source.url
          }))
        });
      } catch (error) {
        const message = error?.message || "Unknown server error.";

        return Response.json(
          {
            answer:
              "The BIS AI service could not process the request. Please try again.",
            technical_error: message
          },
          { status: 500 }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
