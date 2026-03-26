// Netlify serverless function — proxies requests to Claude API
// This avoids CORS issues when calling Claude directly from the browser.
//
// Setup: Add CLAUDE_API_KEY as an environment variable in your Netlify dashboard
// (Site settings → Environment variables) OR pass the key from the app directly.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { message, apiKey, systemPrompt } = body;

  // Use the key passed from the app, or fall back to env var
  const key = apiKey || process.env.CLAUDE_API_KEY;
  if (!key) {
    return { statusCode: 401, body: JSON.stringify({ error: "No API key provided" }) };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 350,
        system: systemPrompt || "You are an expert IPL cricket analyst. Be concise and insightful.",
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { statusCode: resp.status, body: err };
    }

    const data = await resp.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: data.content[0].text }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
