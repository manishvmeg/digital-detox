/**
 * routes/decisions.js
 * Express router managing cognitive fatigue decision helpers.
 * Ingests a dilemma and runs it through cognitive models (Eisenhower Matrix, 10-10-10 Rule) via Claude.
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropicClient = null;

if (apiKey && apiKey !== 'your_claude_api_key_here' && apiKey !== '""') {
  anthropicClient = new Anthropic({ apiKey });
}

/**
 * POST /api/decisions/resolve
 * Analyzes a decision dilemma and returns recommendations to prevent decision fatigue.
 */
router.post('/resolve', async (req, res, next) => {
  try {
    const { dilemma, framework } = req.body;

    if (!dilemma) {
      return res.status(400).json({
        success: false,
        message: 'Dilemma description is required.'
      });
    }

    // Heuristics fallback if Claude is not configured
    if (!anthropicClient) {
      console.warn('[AI Pipeline]: ANTHROPIC_API_KEY not configured. Using local decision heuristics.');
      
      const query = dilemma.toLowerCase();
      let urgencyScore = 3;
      let importanceScore = 4;
      let recommendation = 'Take 10 minutes to breathe, sleep on it, and revisit tomorrow.';
      let analysisText = 'Analysis of details indicates this decision is highly prone to current emotional bias. Delaying is optimal.';

      // Smart heuristics
      if (query.includes('now') || query.includes('boss') || query.includes('urgent') || query.includes('today')) {
        urgencyScore = 8;
        recommendation = 'Address this immediately, but keep your response concise to avoid cognitive drain.';
      }
      if (query.includes('buy') || query.includes('spend') || query.includes('cost') || query.includes('subscription')) {
        importanceScore = 7;
        recommendation = 'Do not purchase. Leverage existing tools for 7 days. If the need persists, buy only with a clear usage plan.';
      }
      if (query.includes('weekend') || query.includes('night') || query.includes('sleep') || query.includes('late')) {
        urgencyScore = 2;
        importanceScore = 6;
        recommendation = 'Silence notifications and handle this on Monday morning. It is not worth your sleep or sanity.';
        analysisText = 'Working outside core hours leads to burnout and diminishes work quality. Setting clear boundaries is essential.';
      }

      const responsePayload = {
        success: true,
        engine: 'local-heuristics',
        framework: framework || 'Eisenhower Matrix',
        analysis: {
          urgency: urgencyScore,
          importance: importanceScore,
          eisenhowerQuadrant: (urgencyScore > 5) 
            ? (importanceScore > 5 ? 'Quadrant I (Do Now)' : 'Quadrant III (Delegate/Minimize)')
            : (importanceScore > 5 ? 'Quadrant II (Schedule/Decide)' : 'Quadrant IV (Eliminate/Mute)'),
          tenTenTen: {
            minutes10: urgencyScore > 5 ? 'Relief of clearing the task' : 'No notable change, task is quiet.',
            months10: importanceScore > 5 ? 'Slightly higher progress on core metrics' : 'Completely forgotten and irrelevant.',
            years10: 'Zero impact on your life trajectory. Conserve energy.'
          },
          recommendation,
          narrative: analysisText
        }
      };

      // Simulated delay
      await new Promise(resolve => setTimeout(resolve, 600));

      return res.status(200).json({
        success: true,
        ...responsePayload
      });
    }

    // Call Anthropic to solve decision fatigue
    const userPrompt = `You are a Decision Optimization Engine designed to combat decision fatigue.
Analyze the following user dilemma: "${dilemma}".
Evaluate it using two cognitive frameworks:
1. Eisenhower Matrix (Urgency vs. Importance score 1-10) and its specific quadrant allocation.
2. The 10-10-10 Rule (What will it matter in 10 minutes? 10 months? 10 years?).

Input variables:
- Dilemma: "${dilemma}"
- Selected framework: "${framework || 'All Frameworks'}"

Return a JSON object containing:
{
  "urgency": number (1-10),
  "importance": number (1-10),
  "eisenhowerQuadrant": "Quadrant I (Do Now)" | "Quadrant II (Schedule)" | "Quadrant III (Delegate)" | "Quadrant IV (Eliminate)",
  "tenTenTen": {
    "minutes10": "string summary",
    "months10": "string summary",
    "years10": "string summary"
  },
  "recommendation": "A single, clear action statement",
  "narrative": "A short 2-sentence explanation of the cognitive analysis"
}

Provide ONLY valid JSON. No conversational wrapper or markdown code block markers.`;

    const message = await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: 0.2,
      messages: [{ role: 'user', content: userPrompt }]
    });

    let resultText = message.content[0].text.trim();
    if (resultText.startsWith('```json')) {
      resultText = resultText.substring(7, resultText.length - 3).trim();
    } else if (resultText.startsWith('```')) {
      resultText = resultText.substring(3, resultText.length - 3).trim();
    }

    const analysis = JSON.parse(resultText);

    res.status(200).json({
      success: true,
      engine: 'claude-3-5-sonnet',
      framework: framework || 'All Frameworks',
      analysis
    });

  } catch (error) {
    console.error('[Claude Decision Core Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve decision dilemma.',
      details: error.message
    });
  }
});

module.exports = router;
