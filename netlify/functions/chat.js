// Netlify serverless function — proxies requests to Claude API with live news context

// Fetch IPL news headlines with source URLs for citation
async function fetchNewsContext(team1, team2) {
  try {
    const query = `IPL 2026 ${team1} ${team2}`.trim();
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const resp = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IPLPredictor/1.0)" },
    });
    if (!resp.ok) return "";

    const xml = await resp.text();
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < 5) {
      const item = match[1];
      const title = (
        /<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(item) ||
        /<title>(.*?)<\/title>/s.exec(item) ||
        []
      )[1] || "";
      const link = (/<link>(.*?)<\/link>/s.exec(item) || [])[1] || "";
      const source = (/<source[^>]*>(.*?)<\/source>/s.exec(item) || [])[1] || "";
      const clean = title.replace(/ - [^-]+$/, "").trim();
      if (clean) articles.push({ title: clean, source: source.trim(), url: link.trim() });
    }

    if (articles.length === 0) return "";
    const timestamp = new Date().toISOString();
    return `\n\n[NEWS CONTEXT - fetched ${timestamp}]\n` +
      articles.map((a, i) => `${i+1}. "${a.title}" (Source: ${a.source}, Link: ${a.url})`).join("\n");
  } catch {
    return "";
  }
}

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

  const { message, apiKey, systemPrompt, team1, team2 } = body;

  const key = apiKey || process.env.CLAUDE_API_KEY;
  if (!key) {
    return { statusCode: 401, body: JSON.stringify({ error: "No API key provided" }) };
  }

  // Fetch live news context (with URLs for citations)
  const newsContext = await fetchNewsContext(team1 || "", team2 || "");
  const enhancedPrompt = (systemPrompt || "You are an expert IPL cricket analyst. Be concise and insightful.") + newsContext;

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
        max_tokens: 500,
        system: enhancedPrompt,
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
