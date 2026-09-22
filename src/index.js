import { BIS_KNOWLEDGE } from "./knowledge.js";

function retrieveKnowledge(question) {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2);

  const scored = BIS_KNOWLEDGE.map(item => {
    const text = (
      item.title +
      " " +
      item.keywords.join(" ") +
      " " +
      item.content
    ).toLowerCase();

    let score = 0;

    for (const word of words) {
      if (text.includes(word)) score++;
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

Return a clear answer suitable for a normal business user.
`;
}

async function askGemini(question, sources, apiKey) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text:
              "You are a careful BIS compliance information assistant. " +
              "Never fabricate official requirements. Use the supplied verified context."
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildGeminiPrompt(question, sources)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Gemini request failed: " + errorText);
  }

  const data = await response.json();

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("") ||
    "The AI service did not return an answer.";

  return answer;
}

function htmlPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BIS AI Assistant</title>

<style>
*{box-sizing:border-box}

body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:#f4f6f9;
  color:#172033;
}

header{
  background:#123b70;
  color:white;
  padding:18px 6%;
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.logo{
  font-size:22px;
  font-weight:700;
}

.badge{
  font-size:12px;
  background:#ffffff20;
  border:1px solid #ffffff40;
  padding:7px 10px;
  border-radius:20px;
}

main{
  max-width:1100px;
  margin:40px auto;
  padding:20px;
}

.card{
  background:white;
  border-radius:14px;
  padding:30px;
  box-shadow:0 4px 20px #00000012;
}

h1{
  margin-top:0;
  color:#123b70;
}

.subtitle{
  color:#596579;
  line-height:1.6;
}

textarea{
  width:100%;
  min-height:140px;
  padding:15px;
  border:1px solid #cbd3df;
  border-radius:9px;
  font-size:16px;
  resize:vertical;
  font-family:inherit;
}

textarea:focus{
  outline:none;
  border-color:#123b70;
}

button{
  margin-top:15px;
  padding:13px 24px;
  border:0;
  border-radius:8px;
  background:#123b70;
  color:white;
  font-size:16px;
  cursor:pointer;
}

button:disabled{
  opacity:.6;
  cursor:not-allowed;
}

.examples{
  margin-top:20px;
  color:#596579;
  font-size:14px;
}

.example{
  display:inline-block;
  margin:5px 5px 0 0;
  padding:7px 10px;
  background:#eef3f8;
  border-radius:6px;
  cursor:pointer;
}

#answer{
  margin-top:25px;
  padding:22px;
  background:#f1f5fa;
  border-radius:10px;
  white-space:pre-wrap;
  line-height:1.65;
  min-height:80px;
}

.sources{
  margin-top:20px;
}

.source{
  background:white;
  border:1px solid #dce2ea;
  border-radius:8px;
  padding:12px;
  margin-top:10px;
}

.source a{
  color:#123b70;
  font-weight:600;
  text-decoration:none;
}

.note{
  margin-top:25px;
  color:#687386;
  font-size:13px;
  line-height:1.5;
}
</style>
</head>

<body>

<header>
  <div class="logo">BIS AI Assistant</div>
  <div class="badge">BIS information assistant</div>
</header>

<main>
  <div class="card">

    <h1>How can I help you?</h1>

    <p class="subtitle">
      Ask questions about Indian Standards, BIS certification,
      product requirements, testing, licensing, QCOs and related
      BIS information in natural language.
    </p>

    <textarea
      id="question"
      placeholder="Example: I manufacture TMT steel bars. What BIS requirements should I check?"
    ></textarea>

    <button id="askButton" onclick="ask()">Ask BIS AI Assistant</button>

    <div class="examples">
      Try:
      <span class="example" onclick="useExample('What is BIS product certification?')">
        What is BIS product certification?
      </span>
      <span class="example" onclick="useExample('How can a manufacturer apply for a BIS licence?')">
        How do I apply for a BIS licence?
      </span>
      <span class="example" onclick="useExample('How can I find the Indian Standard applicable to my product?')">
        Find my Indian Standard
      </span>
    </div>

    <div id="answer">Your answer will appear here.</div>

    <div id="sources" class="sources"></div>

    <div class="note">
      This is an independent project interface using information retrieved
      from official BIS sources. Important compliance decisions should be
      verified against the current official BIS documents and requirements.
    </div>

  </div>
</main>

<script>
function useExample(text){
  document.getElementById("question").value=text;
}

async function ask(){

  const question =
    document.getElementById("question").value.trim();

  const answer =
    document.getElementById("answer");

  const sources =
    document.getElementById("sources");

  const button =
    document.getElementById("askButton");

  if(!question){
    answer.textContent="Please enter a question.";
    return;
  }

  button.disabled=true;
  answer.textContent="Searching verified BIS information and preparing your answer...";
  sources.innerHTML="";

  try{

    const response = await fetch("/api/ask",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        question:question
      })
    });

    const data = await response.json();

    if(!response.ok){
      throw new Error(data.answer || "Request failed.");
    }

    answer.textContent=data.answer || "No answer available.";

    if(data.sources && data.sources.length){

      sources.innerHTML="<h3>Official BIS sources</h3>";

      data.sources.forEach(source => {

        const div=document.createElement("div");
        div.className="source";

        const link=document.createElement("a");
        link.href=source.url;
        link.target="_blank";
        link.rel="noopener noreferrer";
        link.textContent=source.title;

        div.appendChild(link);
        sources.appendChild(div);
      });
    }

  }catch(error){

    answer.textContent =
      "Unable to complete the request right now. Please try again.";

  }finally{

    button.disabled=false;
  }
}
</script>

</body>
</html>`;
}

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(htmlPage(), {
        headers:{
          "content-type":"text/html; charset=UTF-8"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/ask") {

      try {

        const body = await request.json();

        const question =
          String(body.question || "").trim();

        if (!question) {
          return Response.json(
            {answer:"Please enter a question."},
            {status:400}
          );
        }

        if (question.length > 4000) {
          return Response.json(
            {answer:"Please keep your question below 4000 characters."},
            {status:400}
          );
        }

        const sources =
          retrieveKnowledge(question);

        if (!env.GEMINI_API_KEY) {
          return Response.json(
            {answer:"The AI service is not configured."},
            {status:500}
          );
        }

        const answer =
          await askGemini(
            question,
            sources,
            env.GEMINI_API_KEY
          );

        return Response.json({
          answer:answer,
          sources:sources.map(source => ({
            title:source.title,
            url:source.url
          }))
        });

      } catch(error) {

        return Response.json(
          {
            answer:
              "The BIS AI service could not process the request. Please try again."
          },
          {status:500}
        );
      }
    }

    return new Response("Not found",{
      status:404
    });
  }
};