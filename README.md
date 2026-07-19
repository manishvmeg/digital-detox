# Clarity — Cognitive Load Optimizer & Digital Triage Hub

Clarity is an AI-powered control plane designed to tackle **digital overload** and **cognitive fatigue** (the stress, distraction, and decision-weariness caused by too many apps, alerts, subscriptions, and messages). 

Built for the **Idea2Impact Online Hackathon 2026** under the **Theme 3: Crisis Management, HealthTech & Emergency Response** -> **Mental Health & Wellness** category.

---

## 🌟 Key Features

1. **Real-time Cognitive Triage (Live SSE Stream)**
   - Ingests raw, noisy digital signals (emails, Slack chats, bugs, alerts) via a server-sent event (SSE) stream.
   - Leverages **Claude 3.5 Sonnet** (or a local NLP heuristics engine) to categorize alerts into custom lanes: *Deep Focus* (critical), *Read Later* (digest), or *Muted* (silenced).
   - Dynamically calculates your current **Attention Index** to help visualize mental load.

2. **AI Subscription Auditor**
   - Identifies active digital subscriptions (SaaS tools, media streaming, newsletters) and compares payment costs with actual usage telemetry.
   - Provides a one-click **Draft Cancellation** assistant powered by Claude, which generates tailored cancellation requests ready to copy or send via email clients.

3. **Decider AI (Decision Fatigue Relief)**
   - Allows users to offload stressful micro-decisions (e.g., weekend replies, purchase decisions).
   - Analyzes dilemmas using cognitive models: the **Eisenhower Priority Matrix** (Urgency vs. Importance) and the **10-10-10 Life Horizon Rule** (impact in 10 minutes, 10 months, 10 years).

4. **Zen Focus Space (Audio Ambient Machine)**
   - Synthesizes real-time audio focus tracks (binaural theta waves and pink noise) locally using the browser's native **Web Audio API** (no high-bandwidth assets loaded).
   - Features a breathing-rhythm micro-animation helper to guide screen-free stress breaks.

5. **Flexible Integrations Panel**
   - Toggle support for **Google Login** authentication (via GIS/OAuth), **Stripe Sandbox billing integrations**, and **Claude API Live** mode.

---

## 🛠️ Technology Stack & Architecture

- **Backend**: Node.js & Express
- **Frontend**: Responsive HTML5, Vanilla CSS3 (custom glassmorphism style sheet), Vanilla ES6 JavaScript (pure DOM, Web Audio API, SSE clients)
- **AI Integrations**: Claude 3.5 Sonnet (`@anthropic-ai/sdk`) & Gemini Pro (`@google/generative-ai`)
- **Authentication**: Google Identity Services (GSI) OAuth library

### Code Directory Structure
```text
digital-detox/
├── .env                 # Environment config file (created locally)
├── .env.example         # Template for environment variables
├── .gitignore           # Node git exclusion rules
├── package.json         # Project manifests and scripts
├── server.js            # Express server bootstrap
├── routes/
│   ├── auth.js          # Google sign-in verification
│   ├── triage.js        # SSE stream & Claude message classification
│   ├── subscriptions.js # Subscription telemetry & cancellation copy
│   └── decisions.js     # Decision helper processing
└── public/              # Public assets (Frontend)
    ├── index.html       # Primary UI structure
    ├── css/
    │   └── style.css    # Clean, dark-theme styling
    └── js/
        ├── app.js       # Core frontend orchestrator
        ├── auth.js      # Google GIS integration
        └── audio.js     # Web Audio API synthesizer class
```

---

## ⚡ Setup & Local Run Instructions

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### 2. Installation
Run npm install to grab core SDK dependencies:
```bash
npm install
```

### 3. Environment Setup
Configure your API keys in the `.env` file (copied from `.env.example`):
```env
PORT=3000
ANTHROPIC_API_KEY=your_claude_api_key
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
SESSION_SECRET=a_secure_session_secret_key
```
*Note: If no API keys are provided, Clarity will automatically run in **Sandbox Demo Mode** using local NLP rules and templating so you can test all features offline.*

### 4. Running the App
Start the local server:
```bash
npm start
```

Open your browser and navigate to:
[http://localhost:3000](http://localhost:3000)
