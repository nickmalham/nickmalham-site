export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basic rate limiting via Vercel's edge — one request at a time per session
  // For production, consider upstash/redis for proper rate limiting
  const { person, agenda } = req.body;

  if (!person || !agenda) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (person.length > 200 || agenda.length > 500) {
    return res.status(400).json({ error: 'Input too long' });
  }

  const SYSTEM_PROMPT = `You are an elite executive research analyst. Your job is to prepare a concise, insight-rich one-page briefing for a senior executive before a high-stakes meeting.

Given the person being met and the meeting agenda, produce a structured briefing that is sharp, specific, and actionable. Never be generic. Every insight should be grounded in real, verifiable signals — recent interviews, announcements, LinkedIn activity, company news, earnings calls, strategic moves.

Return ONLY a JSON object with this exact structure:
{
  "person": {
    "name": "Full name",
    "role": "Title and company",
    "snapshot": "2-3 sentence sharp read on who this person really is — their reputation, leadership style, what they're known for"
  },
  "company": {
    "position": "One sentence on where the company sits right now — momentum, pressure, or transition",
    "bigBets": ["3 specific strategic bets or initiatives they are publicly pursuing"],
    "pressure": "The one thing keeping their leadership up at night right now"
  },
  "theirPriorities": {
    "walkingIn": "What this person almost certainly cares about walking into this specific meeting — inferred from their context and your agenda",
    "blindspot": "One honest read on what they may be missing or underestimating"
  },
  "yourEdge": {
    "connectionPoints": ["2-3 genuine areas of shared context, interest, or experience to open with"],
    "questions": ["3 sharp questions that will make you look deeply prepared"],
    "talkingPoints": ["2-3 things to lead with that will land well given their current context"]
  },
  "watchOut": "One thing to be careful of — a sensitivity, a recent failure, a topic to avoid or handle carefully"
}

Be specific. Use names, dates, numbers where possible. If you cannot find solid evidence, say so briefly rather than fabricating. No preamble, no markdown, return only the JSON.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [
          {
            role: 'user',
            content: `I am meeting with: ${person}\n\nMy meeting agenda / what I want to achieve: ${agenda}\n\nResearch this person and their organisation thoroughly using web search, then produce the executive briefing JSON.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await response.json();
    const textBlock = data.content?.find((b) => b.type === 'text');

    if (!textBlock) {
      return res.status(502).json({ error: 'No response from AI. Please try again.' });
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json({ briefing: parsed });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
