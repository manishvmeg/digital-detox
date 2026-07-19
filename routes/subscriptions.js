/**
 * routes/subscriptions.js
 * Express router managing digital subscription audits.
 * Identifies active subscriptions, analyzes cost-to-value metrics,
 * and generates tailored cancellation emails using Claude.
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropicClient = null;

if (apiKey && apiKey !== 'your_claude_api_key_here' && apiKey !== '""') {
  anthropicClient = new Anthropic({ apiKey });
}

// Pre-seeded subscriptions with realistic mock telemetry
const subscriptionsMock = [
  { id: 'sub-1', name: 'OpenAI ChatGPT Plus', cost: 20.00, billing: 'Monthly', lastUsed: '3h ago', usageIndex: 85, valueScore: 92, recommendation: 'Keep', category: 'Productivity' },
  { id: 'sub-2', name: 'Adobe Creative Cloud', cost: 54.99, billing: 'Monthly', lastUsed: '45 days ago', usageIndex: 8, valueScore: 12, recommendation: 'Cancel', category: 'Creative' },
  { id: 'sub-3', name: 'Netflix Premium', cost: 22.99, billing: 'Monthly', lastUsed: '12h ago', usageIndex: 65, valueScore: 50, recommendation: 'Downgrade (Standard)', category: 'Entertainment' },
  { id: 'sub-4', name: 'Medium Membership', cost: 5.00, billing: 'Monthly', lastUsed: '28 days ago', usageIndex: 12, valueScore: 25, recommendation: 'Cancel', category: 'Information' },
  { id: 'sub-5', name: 'GitHub Copilot', cost: 10.00, billing: 'Monthly', lastUsed: '1h ago', usageIndex: 90, valueScore: 95, recommendation: 'Keep', category: 'Productivity' },
  { id: 'sub-6', name: 'Duolingo Plus', cost: 12.99, billing: 'Monthly', lastUsed: '14 days ago', usageIndex: 30, valueScore: 35, recommendation: 'Review', category: 'Education' }
];

/**
 * GET /api/subscriptions
 * Retrieves list of active digital subscriptions and telemetry data.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    totalMonthlySpend: subscriptionsMock.reduce((sum, item) => sum + item.cost, 0).toFixed(2),
    potentialSavings: subscriptionsMock
      .filter(item => item.recommendation.toLowerCase().includes('cancel'))
      .reduce((sum, item) => sum + item.cost, 0).toFixed(2),
    subscriptions: subscriptionsMock
  });
});

/**
 * POST /api/subscriptions/cancel-email
 * Generates a formal, tailored subscription cancellation email using Claude.
 */
router.post('/cancel-email', async (req, res, next) => {
  try {
    const { name, cost, category } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Subscription name is required.'
      });
    }

    // Heuristics fallback if Claude API is not configured
    if (!anthropicClient) {
      console.warn('[AI Pipeline]: ANTHROPIC_API_KEY not configured. Generating template on-the-fly.');
      
      const referenceNumber = Math.floor(100000 + Math.random() * 900000);
      const emailTemplate = `Subject: Account Cancellation Request - [Your Name]

Dear Support Team,

I am writing to formally request the cancellation of my subscription for ${name}, effective immediately. 

Please find my account billing details below:
- Subscription: ${name}
- Current Billing: $${cost || 'N/A'} per month
- Category: ${category || 'Digital Service'}
- Customer Reference Code: REF-${referenceNumber}

Please stop all recurring automatic charges associated with my credit card on file immediately. I would appreciate it if you could confirm in writing that this request has been processed and that my subscription will not renew.

Thank you for your assistance.

Sincerely,
[Your Name]
[Your Account Email]`;

      return res.status(200).json({
        success: true,
        engine: 'local-templates',
        email: emailTemplate
      });
    }

    // Call Anthropic to generate a highly realistic, professional, personalized email
    const userPrompt = `Write a formal, polite, and firm subscription cancellation email for the service "${name}" (a ${category} service costing $${cost}/month).
Include placeholders like [Your Name] and [Your Registered Email] where appropriate.
Explain clearly that billing should stop immediately and ask for written confirmation.
Keep the email structured, professional, and clear. Avoid excess narrative or metadata—output only the raw email draft.`;

    const message = await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      temperature: 0.3,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const emailText = message.content[0].text.trim();

    res.status(200).json({
      success: true,
      engine: 'claude-3-5-sonnet',
      email: emailText
    });

  } catch (error) {
    console.error('[Claude Subscription Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cancellation email.',
      details: error.message
    });
  }
});

module.exports = router;
