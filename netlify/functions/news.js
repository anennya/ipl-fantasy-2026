exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const params = event.queryStringParameters || {};
  const teams = (params.teams || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const type = params.type || "general";

  let query;
  if (type === "injury") {
    query = `IPL 2026 injury "playing XI" squad ${teams}`;
  } else {
    query = `IPL 2026 ${teams}`;
  }

  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IPLPredictor/1.0)" },
    });

    if (!response.ok) throw new Error(`RSS fetch failed: ${response.status}`);

    const xml = await response.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const item = match[1];
      // Title: may be CDATA-wrapped or plain
      const title = (
        /<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(item) ||
        /<title>(.*?)<\/title>/s.exec(item) ||
        []
      )[1] || "";
      // Link: Google News RSS puts the real URL in <link> after a redirect
      const link = (/<link>(.*?)<\/link>/s.exec(item) || [])[1] || "";
      // Source name
      const source = (/<source[^>]*>(.*?)<\/source>/s.exec(item) || [])[1] || "";
      const pubDate = (/<pubDate>(.*?)<\/pubDate>/s.exec(item) || [])[1] || "";

      if (!title.trim() || !link.trim()) continue;

      // Calculate relative time
      let timeAgo = "";
      if (pubDate) {
        const diffMs = Date.now() - new Date(pubDate).getTime();
        const diffH = Math.floor(diffMs / 3600000);
        if (diffH < 1) timeAgo = "Just now";
        else if (diffH < 24) timeAgo = `${diffH}h ago`;
        else timeAgo = `${Math.floor(diffH / 24)}d ago`;
      }

      // Clean up title (remove source suffix like " - ESPNcricinfo")
      const cleanTitle = title.replace(/ - [^-]+$/, "").trim();

      items.push({
        title: cleanTitle,
        link: link.trim(),
        source: source.trim(),
        timeAgo,
      });
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(items),
    };
  } catch (err) {
    // Return empty array on error — frontend handles gracefully
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify([]),
    };
  }
};
