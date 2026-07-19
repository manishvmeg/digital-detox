/**
 * public/js/app.js
 * Main client-side orchestrator for the Clarity Cognitive Load Dashboard.
 * Connects SSE streams, manages tabs, triggers AI endpoints, and controls the audio synthesizer.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Systems
  const audioSynth = new AmbientSynthesizer();
  const auth = new AuthManager(updateUserUI);
  auth.init();

  // State Variables
  let rawNotifications = [];
  let sseEventSource = null;
  let zenInterval = null;
  let zenTimer = null;
  let isZenSessionActive = false;

  // DOM Elements
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');
  const rawFeedContainer = document.getElementById('rawNotificationsFeed');
  const triageBtn = document.getElementById('triageBtn');
  const clearTriageBtn = document.getElementById('clearTriageBtn');
  
  // Lanes
  const focusLane = document.getElementById('focusLaneItems');
  const digestLane = document.getElementById('digestLaneItems');
  const muteLane = document.getElementById('muteLaneItems');
  const focusCount = document.getElementById('focusLaneCount');
  const digestCount = document.getElementById('digestLaneCount');
  const muteCount = document.getElementById('muteLaneCount');
  
  // Metrics & Gauges
  const cogScoreElement = document.getElementById('cognitiveLoadScore');
  const cogStatusElement = document.getElementById('loadStatus');
  const distractionsCountElement = document.getElementById('distractionsCount');
  const monthlySpendElement = document.getElementById('monthlySpend');
  const gaugeBar = document.getElementById('gaugeBar');

  // Integrations
  const claudeToggle = document.getElementById('claudeToggle');
  const claudeStatus = document.getElementById('claudeStatus');

  // Zen Space
  const breathingRing = document.getElementById('breathingRing');
  const breathingText = document.getElementById('breathingText');
  const startZenBtn = document.getElementById('startZenSessionBtn');
  const thetaBtn = document.getElementById('thetaBeatsBtn');
  const pinkBtn = document.getElementById('pinkNoiseBtn');
  const volumeSlider = document.getElementById('volumeControl');

  // Decisions
  const resolveDecisionBtn = document.getElementById('resolveDecisionBtn');
  const dilemmaInput = document.getElementById('dilemmaInput');
  const frameworkSelect = document.getElementById('frameworkSelect');
  const decResultsCard = document.getElementById('decisionResultsCard');
  const decPlaceholder = document.getElementById('decisionResultsPlaceholder');
  const decContent = document.getElementById('decisionResultsContent');

  // Subscriptions
  const refreshSubsBtn = document.getElementById('refreshSubsBtn');
  const subsTableBody = document.getElementById('subscriptionsTableBody');
  const cancelAssistant = document.getElementById('cancelAssistant');
  const closeCancelBtn = document.getElementById('closeCancelAssistantBtn');
  const cancelEmailTextarea = document.getElementById('cancellationEmailContent');
  const copyEmailBtn = document.getElementById('copyEmailBtn');
  const sendMailBtn = document.getElementById('sendMailBtn');

  // ==========================================
  // 1. Tab Navigation & System Initialization
  // ==========================================
  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      tabLinks.forEach(l => l.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      link.classList.add('active');
      const tabId = link.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Check Local Session Mode Toggles
  if (localStorage.getItem('clarity_claude_active') === 'true') {
    claudeToggle.checked = true;
    claudeStatus.textContent = 'API Live';
    claudeStatus.style.color = 'var(--accent-success)';
  }

  // Handle Claude Integration Toggle (switches UI Mode for AI requests)
  claudeToggle.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    localStorage.setItem('clarity_claude_active', isChecked);
    if (isChecked) {
      claudeStatus.textContent = 'API Live';
      claudeStatus.style.color = 'var(--accent-success)';
      alert('Claude API Live Mode Selected! Make sure process.env.ANTHROPIC_API_KEY is configured on your server.');
    } else {
      claudeStatus.textContent = 'Mock Mode';
      claudeStatus.style.color = 'var(--text-muted)';
    }
  });

  // ==========================================
  // 2. Authentication UI Updates
  // ==========================================
  function updateUserUI(user, mode) {
    const loginSection = document.getElementById('googleSignInBtn');
    const profileSection = document.getElementById('userProfile');
    
    if (user) {
      loginSection.classList.add('hidden');
      profileSection.classList.remove('hidden');
      document.getElementById('userAvatar').src = user.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde';
      document.getElementById('userName').textContent = user.givenName || user.name;
      
      const badge = document.getElementById('authMode');
      badge.textContent = mode === 'live' ? 'Google Auth' : 'Sandbox';
      badge.style.background = mode === 'live' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)';
      badge.style.color = mode === 'live' ? 'var(--accent-success)' : 'var(--accent-primary)';
    } else {
      loginSection.classList.remove('hidden');
      profileSection.classList.add('hidden');
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.logout();
  });

  // ==========================================
  // 3. Real-Time Stream (SSE client)
  // ==========================================
  function startNotificationStream() {
    if (sseEventSource) return;

    sseEventSource = new EventSource('/api/triage/stream');
    
    sseEventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      
      if (payload.type === 'initial') {
        rawNotifications = payload.data;
        renderRawFeed();
      } else if (payload.type === 'new_message') {
        // Prevent buffer bloat
        if (rawNotifications.length >= 10) {
          rawNotifications.pop();
        }
        rawNotifications.unshift(payload.data);
        renderRawFeed();
        
        // Flash metric and increment count
        distractionsCountElement.textContent = rawNotifications.length;
        recalculateAttentionMetrics();
      }
    };

    sseEventSource.onerror = (err) => {
      console.error('[SSE connection failed]: Stream disconnected. Reconnecting...');
    };
  }

  function renderRawFeed() {
    if (rawNotifications.length === 0) {
      rawFeedContainer.innerHTML = `
        <div class="feed-placeholder">
          <i class="fa-solid fa-circle-check" style="color: var(--accent-success);"></i>
          <p>No incoming digital distractions. Safe zone.</p>
        </div>`;
      return;
    }

    rawFeedContainer.innerHTML = rawNotifications.map(item => `
      <div class="feed-item" data-id="${item.id}">
        <div class="feed-item-header">
          <span class="feed-item-source"><i class="fa-solid fa-satellite"></i> ${item.source}</span>
          <span class="feed-item-time">${item.timestamp}</span>
        </div>
        <div class="feed-item-sender">${item.sender}</div>
        <div class="feed-item-body">${item.content}</div>
      </div>
    `).join('');
  }

  // Start feed instantly
  startNotificationStream();

  // ==========================================
  // 4. AI Cognitive Triage
  // ==========================================
  triageBtn.addEventListener('click', async () => {
    if (rawNotifications.length === 0) {
      alert('Your raw digital firehose is empty. Nothing to triage.');
      return;
    }

    triageBtn.disabled = true;
    triageBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Organizing Triage Lanes...`;

    try {
      const response = await fetch('/api/triage/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: rawNotifications })
      });

      const result = await response.json();

      if (result.success) {
        // Distribute triaged responses to lanes
        distributeToLanes(result.triaged);
        
        // Empty raw bucket
        rawNotifications = [];
        renderRawFeed();
        distractionsCountElement.textContent = 0;
        
        recalculateAttentionMetrics();
      } else {
        alert('Triage analysis failed: ' + result.message);
      }
    } catch (e) {
      console.error(e);
      alert('Unable to reach AI Triage Endpoint. Running local heuristics.');
    } finally {
      triageBtn.disabled = false;
      triageBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Run AI Cognitive Triage`;
    }
  });

  function distributeToLanes(items) {
    // Clear placeholders
    focusLane.innerHTML = '';
    digestLane.innerHTML = '';
    muteLane.innerHTML = '';

    const focusList = items.filter(x => x.lane === 'focus');
    const digestList = items.filter(x => x.lane === 'digest');
    const muteList = items.filter(x => x.lane === 'mute');

    // Update Counts
    focusCount.textContent = focusList.length;
    digestCount.textContent = digestList.length;
    muteCount.textContent = muteList.length;

    // Render focus lane
    if (focusList.length > 0) {
      focusLane.innerHTML = focusList.map(item => createLaneItemHtml(item, 'danger')).join('');
    } else {
      focusLane.innerHTML = `<div class="lane-placeholder">0 Urgent tasks</div>`;
    }

    // Render digest lane
    if (digestList.length > 0) {
      digestLane.innerHTML = digestList.map(item => createLaneItemHtml(item, 'info')).join('');
    } else {
      digestLane.innerHTML = `<div class="lane-placeholder">0 Pending newsletters</div>`;
    }

    // Render mute lane
    if (muteList.length > 0) {
      muteLane.innerHTML = muteList.map(item => createLaneItemHtml(item, 'muted')).join('');
    } else {
      muteLane.innerHTML = `<div class="lane-placeholder">0 Silenced streams</div>`;
    }
  }

  function createLaneItemHtml(item, statusClass) {
    return `
      <div class="triaged-item" data-id="${item.id}">
        <div class="triaged-item-title">
          <span>${item.sender} (${item.source})</span>
          <span class="weight-label">W: ${item.cognitiveWeight || 2}</span>
        </div>
        <div class="triaged-item-summary">${item.summary}</div>
        <div class="triaged-item-action">
          <i class="fa-solid fa-bolt"></i> ${item.actionItem}
        </div>
      </div>
    `;
  }

  clearTriageBtn.addEventListener('click', () => {
    focusLane.innerHTML = `<div class="lane-placeholder">Critical actionable items appear here</div>`;
    digestLane.innerHTML = `<div class="lane-placeholder">General updates and newsletters</div>`;
    muteLane.innerHTML = `<div class="lane-placeholder">Chat clutter and spam silenced</div>`;
    focusCount.textContent = 0;
    digestCount.textContent = 0;
    muteCount.textContent = 0;
    recalculateAttentionMetrics();
  });

  // Dynamic Attention Index Recalculator
  function recalculateAttentionMetrics() {
    let rawWeight = rawNotifications.length * 5;
    
    // Count active items in triage lanes
    const activeFocus = document.querySelectorAll('#focusLaneItems .triaged-item').length;
    const activeDigest = document.querySelectorAll('#digestLaneItems .triaged-item').length;
    
    let totalStress = rawWeight + (activeFocus * 15) + (activeDigest * 4);
    let index = Math.max(10, 100 - totalStress);

    cogScoreElement.textContent = index;

    // SVG Gauge DashOffset calc (282.6 is full circumference)
    // 100 index -> offset 0, 0 index -> offset 282.6
    const offset = 282.6 - (282.6 * index) / 100;
    gaugeBar.style.strokeDashoffset = offset;

    // Apply color states to index and gauge
    if (index > 75) {
      cogStatusElement.textContent = 'Zen Focus';
      cogStatusElement.className = 'badge success';
      gaugeBar.style.stroke = 'var(--accent-success)';
    } else if (index > 45) {
      cogStatusElement.textContent = 'Fatigued';
      cogStatusElement.className = 'badge warning';
      gaugeBar.style.stroke = 'var(--accent-warning)';
    } else {
      cogStatusElement.textContent = 'Cognitive Lock';
      cogStatusElement.className = 'badge alert';
      gaugeBar.style.stroke = 'var(--accent-danger)';
    }
  }

  // Initial calculation
  recalculateAttentionMetrics();

  // ==========================================
  // 5. Zen Focus Session
  // ==========================================
  let breathState = 'in';

  function runBreathingInterval() {
    if (breathState === 'in') {
      breathingRing.classList.remove('breathing-out');
      breathingRing.classList.add('breathing-in');
      breathingText.textContent = 'Breathe In';
      breathState = 'hold';
    } else if (breathState === 'hold') {
      breathingText.textContent = 'Hold';
      breathState = 'out';
    } else if (breathState === 'out') {
      breathingRing.classList.remove('breathing-in');
      breathingRing.classList.add('breathing-out');
      breathingText.textContent = 'Breathe Out';
      breathState = 'in';
    }
  }

  startZenBtn.addEventListener('click', () => {
    isZenSessionActive = !isZenSessionActive;

    if (isZenSessionActive) {
      startZenBtn.innerHTML = `<i class="fa-solid fa-stop"></i> Terminate Session`;
      startZenBtn.style.background = 'var(--accent-danger)';
      
      // Start Breathing Circle Cycle (4s transitions)
      breathState = 'in';
      runBreathingInterval();
      zenInterval = setInterval(runBreathingInterval, 4000);
      
      // Play Binaural sound as baseline
      audioSynth.toggleThetaBeats();
      thetaBtn.classList.add('playing');
      
      // Adjust system metrics to reflect screen isolation
      cogScoreElement.textContent = 98;
      gaugeBar.style.strokeDashoffset = 282.6 - (282.6 * 98) / 100;
      gaugeBar.style.stroke = 'var(--accent-success)';
      cogStatusElement.textContent = 'Screen Safe';
      cogStatusElement.className = 'badge success';
    } else {
      clearInterval(zenInterval);
      audioSynth.stop();
      thetaBtn.classList.remove('playing');
      pinkBtn.classList.remove('playing');
      
      breathingRing.className = 'breathing-ring';
      breathingText.textContent = 'Focus';
      startZenBtn.innerHTML = `<i class="fa-solid fa-play"></i> Start 25m Focus Block`;
      startZenBtn.style.background = 'var(--accent-primary)';
      
      recalculateAttentionMetrics();
    }
  });

  thetaBtn.addEventListener('click', () => {
    const isPlaying = audioSynth.toggleThetaBeats();
    pinkBtn.classList.remove('playing');
    if (isPlaying) {
      thetaBtn.classList.add('playing');
    } else {
      thetaBtn.classList.remove('playing');
    }
  });

  pinkBtn.addEventListener('click', () => {
    const isPlaying = audioSynth.togglePinkNoise();
    thetaBtn.classList.remove('playing');
    if (isPlaying) {
      pinkBtn.classList.add('playing');
    } else {
      pinkBtn.classList.remove('playing');
    }
  });

  volumeSlider.addEventListener('input', (e) => {
    audioSynth.setVolume(e.target.value);
  });

  // ==========================================
  // 6. Subscription Auditor
  // ==========================================
  async function loadSubscriptions() {
    try {
      const response = await fetch('/api/subscriptions');
      const data = await response.json();

      if (data.success) {
        monthlySpendElement.textContent = `$${data.totalMonthlySpend}`;
        document.querySelector('.trend.green').textContent = `Potential -$${data.potentialSavings}/mo saved`;
        renderSubscriptions(data.subscriptions);
      }
    } catch (e) {
      console.error('Failed to load subscriptions:', e);
    }
  }

  function renderSubscriptions(subs) {
    subsTableBody.innerHTML = subs.map(sub => {
      let recClass = 'success';
      if (sub.recommendation.includes('Cancel')) recClass = 'danger';
      else if (sub.recommendation.includes('Downgrade')) recClass = 'warning';

      let fillClass = 'high';
      if (sub.usageIndex < 20) fillClass = 'low';
      else if (sub.usageIndex < 50) fillClass = 'medium';

      return `
        <tr>
          <td><strong>${sub.name}</strong><br><small class="text-muted">${sub.category}</small></td>
          <td>$${sub.cost.toFixed(2)} / mo</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill ${fillClass}" style="width: ${sub.usageIndex}%"></div>
            </div>
            <small class="text-muted">${sub.usageIndex}% active logs</small>
          </td>
          <td><strong>${sub.valueScore} / 100</strong></td>
          <td><span class="badge ${recClass}">${sub.recommendation}</span></td>
          <td>
            ${sub.recommendation.toLowerCase().includes('keep') 
              ? `<button class="btn btn-sm btn-outline" disabled>Optimized</button>`
              : `<button class="btn btn-sm btn-accent cancel-btn" data-name="${sub.name}" data-cost="${sub.cost}" data-category="${sub.category}">
                  <i class="fa-solid fa-envelope"></i> Draft Cancel
                 </button>`
            }
          </td>
        </tr>
      `;
    }).join('');

    // Attach cancellation event listeners
    document.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.currentTarget;
        const name = item.getAttribute('data-name');
        const cost = item.getAttribute('data-cost');
        const category = item.getAttribute('data-category');

        cancelAssistant.classList.remove('hidden');
        cancelEmailTextarea.value = "Generating custom cancellation email via Claude 3.5 Sonnet...";
        
        // Scroll to assistant
        cancelAssistant.scrollIntoView({ behavior: 'smooth' });

        try {
          const res = await fetch('/api/subscriptions/cancel-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, cost, category })
          });
          const data = await res.json();
          
          if (data.success) {
            cancelEmailTextarea.value = data.email;
            
            // Build mailto links dynamically
            const subject = encodeURIComponent(`Request for Account Cancellation: ${name}`);
            const body = encodeURIComponent(data.email);
            sendMailBtn.href = `mailto:support@${name.toLowerCase().replace(/\s+/g, '')}.com?subject=${subject}&body=${body}`;
          } else {
            cancelEmailTextarea.value = "Error generating cancellation copy: " + data.message;
          }
        } catch (err) {
          cancelEmailTextarea.value = "Fallback error generating copy. Please copy/paste manually.";
        }
      });
    });
  }

  closeCancelBtn.addEventListener('click', () => {
    cancelAssistant.classList.add('hidden');
  });

  copyEmailBtn.addEventListener('click', () => {
    cancelEmailTextarea.select();
    document.execCommand('copy');
    alert('Cancellation template copied to clipboard!');
  });

  // Load Subscriptions dynamically on page build
  loadSubscriptions();
  refreshSubsBtn.addEventListener('click', loadSubscriptions);

  // ==========================================
  // 7. Decider AI
  // ==========================================
  resolveDecisionBtn.addEventListener('click', async () => {
    const dilemma = dilemmaInput.value.trim();
    if (!dilemma) {
      alert('Please describe your dilemma before triggering evaluation.');
      return;
    }

    resolveDecisionBtn.disabled = true;
    resolveDecisionBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Resolving decision fatigue...`;
    
    decResultsPlaceholder.classList.add('hidden');
    decContent.classList.add('hidden');

    try {
      const response = await fetch('/api/decisions/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dilemma,
          framework: frameworkSelect.value
        })
      });

      const data = await response.json();

      if (data.success) {
        const analysis = data.analysis;
        
        // Populate elements
        document.getElementById('decisionRecommendation').textContent = analysis.recommendation;
        document.getElementById('quadrantDisplay').textContent = analysis.eisenhowerQuadrant;
        document.getElementById('urgencyValue').textContent = analysis.urgency;
        document.getElementById('importanceValue').textContent = analysis.importance;
        
        document.getElementById('tenMinImpact').textContent = analysis.tenTenTen.minutes10;
        document.getElementById('tenMonthImpact').textContent = analysis.tenTenTen.months10;
        document.getElementById('tenYearImpact').textContent = analysis.tenTenTen.years10;
        
        document.getElementById('decisionNarrative').textContent = analysis.narrative;

        // Visual Reveal
        decContent.classList.remove('hidden');
      } else {
        decResultsPlaceholder.classList.remove('hidden');
        alert('Failed to resolve decision: ' + data.message);
      }
    } catch (e) {
      console.error(e);
      decResultsPlaceholder.classList.remove('hidden');
      alert('Could not connect to Decider API node.');
    } finally {
      resolveDecisionBtn.disabled = false;
      resolveDecisionBtn.innerHTML = `<i class="fa-solid fa-microchip"></i> Analyze Dilemma with Claude`;
    }
  });

});
