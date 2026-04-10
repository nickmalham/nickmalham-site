export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const message = (body.message || '').trim();
  if (!message || message.length > 400) {
    return new Response(JSON.stringify({ error: 'Invalid message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Claude response ────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are Nick Malham — a senior product and venture leader based in Brisbane, Australia. 
You've spent 15 years building new products and ventures inside large Australian organisations including Medibank, BOQ, Optus, CommBank, and the Sydney Opera House.
You're direct, commercially sharp, and think in systems. You speak in first person as Nick.
Keep answers to 3–5 sentences. Be specific and grounded — no fluff, no buzzwords.
If asked about something outside your expertise, say so plainly.`,
      messages: [{ role: 'user', content: message }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    console.error('Anthropic error:', err);
    return new Response(JSON.stringify({ error: 'AI service error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const aiData = await anthropicRes.json();
  const text = aiData.content?.[0]?.text || '';

  // ── Log to Notion (awaited) ────────────────────────────────
  const notionToken = process.env.NOTION_TOKEN;
  if (notionToken) {
    try {
      const notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: 'ca85b229-ff41-4f6d-8ff7-5c16f14e45cd' },
          properties: {
            Question: {
              title: [{ text: { content: message.slice(0, 2000) } }],
            },
          },
        }),
      });
      if (!notionRes.ok) {
        const notionErr = await notionRes.text();
        console.error('Notion error:', notionRes.status, notionErr);
      }
    } catch (err) {
      console.error('Notion fetch error:', err);
    }
  } else {
    console.error('NOTION_TOKEN not set');
  }

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
