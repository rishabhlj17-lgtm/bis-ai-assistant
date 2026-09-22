import { BIS_KNOWLEDGE } from "./knowledge.js";
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BIS AI Assistant</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#f5f7fa;color:#172033}
header{background:#123b70;color:white;padding:18px 6%;font-size:22px;font-weight:700}
main{max-width:1000px;margin:50px auto;padding:20px}
.card{background:white;border-radius:14px;padding:30px;box-shadow:0 4px 20px #00000012}
h1{margin-top:0}
textarea{width:100%;min-height:120px;padding:15px;border:1px solid #ccd3df;border-radius:8px;font-size:16px;resize:vertical}
button{margin-top:15px;padding:12px 22px;border:0;border-radius:8px;background:#123b70;color:white;font-size:16px;cursor:pointer}
button:hover{opacity:.9}
#answer{margin-top:25px;padding:20px;background:#f1f5fa;border-radius:10px;white-space:pre-wrap;min-height:80px}
.small{color:#657086;font-size:14px;margin-top:10px}
</style>
</head>
<body>
<header>BIS AI Assistant</header>
<main>
<div class="card">
<h1>How can I help?</h1>
<p>Ask questions about Indian Standards, BIS certification, requirements, testing, licensing and related BIS information.</p>

<textarea id="question" placeholder="Example: I manufacture TMT steel bars. What BIS requirements should I check?"></textarea>

<button onclick="ask()">Ask BIS AI Assistant</button>

<div id="answer">Your answer will appear here.</div>
<div class="small">Project interface — verify important compliance requirements against official BIS sources.</div>
</div>
</main>

<script>
async function ask(){
  const question=document.getElementById("question").value.trim();
  const answer=document.getElementById("answer");

  if(!question){
    answer.textContent="Please enter a question.";
    return;
  }

  answer.textContent="Searching BIS knowledge...";

  try{
    const response=await fetch("/api/ask",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({question})
    });

    const data=await response.json();
    answer.textContent=data.answer || "No answer available.";
  }catch(error){
    answer.textContent="Unable to contact the BIS AI service.";
  }
}
</script>
</body>
</html>
      `, {
        headers: {
          "content-type": "text/html; charset=UTF-8"
        }
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

        return Response.json({
          answer:
            "BIS AI Assistant received your question:\\n\\n" +
            question +
            "\\n\\nThe verified BIS RAG and AI layer will be connected next."
        });
      } catch {
        return Response.json(
          { answer: "Invalid request." },
          { status: 400 }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  }
};