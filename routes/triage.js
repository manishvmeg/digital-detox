/**
 * routes/triage.js
 * Express router for Cognitive Triage.
 * Includes the SSE real-time notification stream and the Claude-based AI text classification.
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic SDK if key is provided
const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropicClient = null;

if (apiKey && apiKey !== 'your_claude_api_key_here' && apiKey !== '""') {
  anthropicClient = new Anthropic({ apiKey });
}

// Pre-seeded notification feed for the real-time stream
const notificationsPool = [
  { id: 1, source: 'Slack', sender: 'Sarah Connor (Product)', content: 'CRITICAL: The production deployment failed on the payment gateway. We need to roll back the migration. Are you online?', timestamp: 'Just now' },
  { id: 2, source: 'Gmail', sender: 'HR Newsletter', content: 'Weekly newsletter: Check out the new team building photos from last Friday and submit your timesheets before end of day.', timestamp: '2m ago' },
  { id: 3, source: 'Jira', sender: 'Bug Tracker', content: 'Ticket [SEC-403] has been assigned to you: Security vulnerability identified in the oauth token storage flow.', timestamp: '5m ago' },
  { id: 4, source: 'WhatsApp', sender: 'Dad', content: 'Hey, did you order that fertilizer for the garden? Also your mom says hello!', timestamp: '10m ago' },
  { id: 5, source: 'Google Calendar', sender: 'Sync Engine', content: 'Invitation: Q3 Roadmap Review on Tuesday, July 21st, 2026, 14:00 - 15:30. Organizer: Director of Product.', timestamp: '15m ago' },
  { id: 6, source: 'GitHub', sender: 'Dependabot', content: 'Security Alert: express package has an open prototype pollution vulnerability. Update package.json immediately.', timestamp: '20m ago' },
  { id: 7, source: 'Slack', sender: 'Channel #general', content: 'Lunch is here! Today we have tacos and burritos in the cafeteria. Come grab it while it is hot.', timestamp: '30m ago' },
  { id: 8, source: 'LinkedIn', sender: 'Recruiter', content: 'Hi, I saw your profile and thought you would be a great fit for a Senior Software Engineer position at a fast-growing Web3 startup.', timestamp: '1h ago' }
];

/**
 * GET /api/triage/stream
 * Server-Sent Events (SSE) endpoint to stream real-time digital overload messages.
 */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  console.log('[SSE Client Connected]: Starting notification stream.');

  let poolIndex = 0;

  // Send an initial batch of 3 notifications immediately
  const initialBatch = notificationsPool.slice(0, 3);
  res.write(`data: ${JSON.stringify({ type: 'initial', data: initialBatch })}\n\n`);
  poolIndex = 3;

  // Stream a new notification every 10 seconds to simulate a live phone stream
  const intervalId = setInterval(() => {
    if (poolIndex >= notificationsPool.length) {
      poolIndex = 0; // Loop pool for continuous demo
    }
    const notification = {
      ...notificationsPool[poolIndex],
      id: Date.now() + poolIndex, // Ensure unique IDs
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    res.write(`data: ${JSON.stringify({ type: 'new_message', data: notification })}\n\n`);
    poolIndex++;
  }, 10000);

  req.on('close', () => {
    console.log('[SSE Client Disconnected]: Stopping stream.');
    clearInterval(intervalId);
    res.end();
  });
});

/**
 * POST /api/triage/analyze
 * Batch triages notifications using Claude 3.5 Sonnet or smart local heuristics.
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Payload must contain a list of items to analyze.'
      });
    }

    if (items.length === 0) {
      return res.status(200).json({
        success: true,
        triaged: []
      });
    }

    // Standard fallback heuristics if API key is not present
    if (!anthropicClient) {
      console.warn('[AI Pipeline]: ANTHROPIC_API_KEY is not set. Using local heuristic NLP engine.');
      
      const triaged = items.map(item => {
        const text = (item.content || '').toLowerCase();
        let lane = 'digest'; // Default lane
        let actionItem = 'Review update.';

        // Rough cognitive rules
        if (text.includes('critical') || text.includes('failed') || text.includes('vulnerability') || text.includes('assigned') || text.includes('asap') || text.includes('rollback')) {
          lane = 'focus';
          actionItem = 'Investigate error or high priority ticket.';
        } else if (text.includes('newsletter') || text.includes('lunch') || text.includes('tacos') || text.includes('recruiter') || text.includes('hello')) {
          lane = 'mute';
          actionItem = 'Snoozed/No action needed.';
        } else if (text.includes('invitation') || text.includes('roadmap') || text.includes('meeting')) {
          lane = 'digest';
          actionItem = 'Verify availability for calendar sync.';
        }

        // Clean summarized text
        const snippet = item.content.length > 60 ? item.content.substring(0, 60) + '...' : item.content;

        return {
          id: item.id,
          source: item.source,
          sender: item.sender,
          content: item.content,
          lane,
          summary: `Summarized notification from ${item.source}: "${snippet}"`,
          actionItem,
          cognitiveWeight: lane === 'focus' ? 8 : (lane === 'digest' ? 3 : 1)
        };
      });

      // Artificial response delay to simulate AI processing in UX
      await new Promise(resolve => setTimeout(resolve, 800));

      return res.status(200).json({
        success: true,
        engine: 'local-heuristics',
        triaged
      });
    }

    // Live AI processing with Claude 3.5 Sonnet
    const userPrompt = `You are a Cognitive Load Triage Engine. Analyze the following notification messages and classify them into priority lanes to save mental bandwidth.
Lanes definition:
- focus: Urgent, actionable work related items requiring immediate human response.
- digest: Secondary items to be read later (e.g. general updates, calendar events, status checks).
- mute: Completely non-urgent items, noise, newsletters, chat chatter, spam.

Input JSON items:
${JSON.stringify(items, null, 2)}

Return a JSON array of objects representing the triaged items. Each object MUST contain:
- id: the matching input id
- lane: "focus", "digest", or "mute"
- summary: a short, clear 1-sentence summarization of the item.
- actionItem: a single, short action path (e.g., "Review server logs immediately", "Ignore newsletter").
- cognitiveWeight: an integer score from 1 (lowest distraction) to 10 (highest overload).

Ensure the output is valid JSON, containing only the array. Do not include markdown wraps or introductory text.`;

    const message = await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Standard Claude 3.5 Sonnet
      max_tokens: 1500,
      temperature: 0.2,
      system: 'You are a professional cognitive engineer specializing in productivity and human attention span.',
      messages: [{ role: 'user', content: userPrompt }]
    });

    let resultText = message.content[0].text.trim();
    
    // Safety check: parse out JSON markdown block if Claude wraps it
    if (resultText.startsWith('```json')) {
      resultText = resultText.substring(7, resultText.length - 3).trim();
    } else if (resultText.startsWith('```')) {
      resultText = resultText.substring(3, resultText.length - 3).trim();
    }

    const triaged = JSON.parse(resultText);

    res.status(200).json({
      success: true,
      engine: 'claude-3-5-sonnet',
      triaged
    });

  } catch (error) {
    console.error('[Claude Triage Core Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process AI triage.',
      details: error.message
    });
  }
});

module.exports = router;
