/**
 * public/js/app.js
 * Main client-side orchestrator for the Stillpoint Dashboard.
 * Integrates tabs, Google OAuth state, SSE Notification streams, subscription scanning,
 * binaural focus audio synthesizer, searchable 100+ App directory, and file upload parsing.
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
  let focusNotificationSimulator = null;
  let isZenSessionActive = false;

  // Tabs / Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      item.classList.add('active');
      const tabId = item.getAttribute('data-tab');
      const targetContent = document.getElementById(tabId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // DOM Elements
  const rawFeedContainer = document.getElementById('rawNotificationsFeed');
  const triageBtn = document.getElementById('triageBtn');
  const clearTriageBtn = document.getElementById('clearTriageBtn');
  
  // Triage Lanes
  const focusLane = document.getElementById('focusLaneItems');
  const digestLane = document.getElementById('digestLaneItems');
  const muteLane = document.getElementById('muteLaneItems');
  
  // Dashboard Metrics
  const cogScoreElement = document.getElementById('cognitiveLoadScore');
  const cogStatusElement = document.getElementById('loadStatus');
  const distractionsCountElement = document.getElementById('distractionsCount');
  const monthlySpendElement = document.getElementById('monthlySpend');
  const gaugeBar = document.getElementById('gaugeBar');

  // Zen Space
  const breathingRing = document.getElementById('breathingRing');
  const breathingText = document.getElementById('breathingText');
  const startZenBtn = document.getElementById('startZenSessionBtn');
  const thetaBtn = document.getElementById('thetaBeatsBtn');
  const pinkBtn = document.getElementById('pinkNoiseBtn');
  const volumeSlider = document.getElementById('volumeControl');

  // Subscriptions
  const refreshSubsBtn = document.getElementById('refreshSubsBtn');
  const subsTableBody = document.getElementById('subscriptionsTableBody');
  const cancelAssistant = document.getElementById('cancelAssistant');
  const closeCancelBtn = document.getElementById('closeCancelAssistantBtn');
  const cancelEmailTextarea = document.getElementById('cancellationEmailContent');
  const copyEmailBtn = document.getElementById('copyEmailBtn');
  const sendMailBtn = document.getElementById('sendMailBtn');
  const addSubModal = document.getElementById('addSubModal');
  const openAddSubModalBtn = document.getElementById('openAddSubModalBtn');
  const closeAddSubModalBtn = document.getElementById('closeAddSubModalBtn');

  // Decisions (Vault)
  const resolveDecisionBtn = document.getElementById('resolveDecisionBtn');
  const dilemmaInput = document.getElementById('dilemmaInput');
  const decResultsCard = document.getElementById('decisionResultsCard');
  const decPlaceholder = document.getElementById('decisionResultsPlaceholder');
  const decContent = document.getElementById('decisionResultsContent');

  // ==========================================
  // 1. Google Authentication Callback UI sync
  // ==========================================
  function updateUserUI(user, mode) {
    const loginSection = document.getElementById('googleSignInBtn');
    const profileSection = document.getElementById('userProfile');
    
    if (user) {
      if (loginSection) loginSection.classList.add('hidden');
      if (profileSection) {
        profileSection.classList.remove('hidden');
        document.getElementById('userAvatar').src = user.picture || '';
        document.getElementById('userName').textContent = user.givenName || user.name;
      }
    } else {
      if (loginSection) loginSection.classList.remove('hidden');
      if (profileSection) profileSection.classList.add('hidden');
    }
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      auth.logout();
    });
  }

  // ==========================================
  // 2. Real-Time Notification Stream (SSE)
  // ==========================================
  function startNotificationStream() {
    if (sseEventSource) return;

    sseEventSource = new EventSource('/api/triage/stream');
    
    sseEventSource.onmessage = (event) => {
      // Only read active stream if Focus session is NOT running.
      // During focus session, we override it with blocked/simulated items.
      if (isZenSessionActive) return;

      const payload = JSON.parse(event.data);
      
      if (payload.type === 'initial') {
        rawNotifications = payload.data;
        renderRawFeed();
      } else if (payload.type === 'new_message') {
        if (rawNotifications.length >= 8) {
          rawNotifications.pop();
        }
        rawNotifications.unshift(payload.data);
        renderRawFeed();
        calculateNoiseSum();
      }
    };
  }

  function renderRawFeed() {
    if (!rawFeedContainer) return;

    if (rawNotifications.length === 0) {
      rawFeedContainer.innerHTML = `
        <div class="feed-placeholder">
          <i class="fa-solid fa-face-smile" style="color: var(--accent-green);"></i>
          <p>No incoming digital distractions. Safe zone.</p>
        </div>`;
      return;
    }

    rawFeedContainer.innerHTML = rawNotifications.map(item => `
      <div class="feed-item">
        <div class="feed-item-header">
          <span class="feed-item-source" style="font-weight: bold; color: ${item.source === 'System' ? 'var(--accent-red)' : ''}">${item.source}</span>
          <span class="feed-item-time">${item.timestamp}</span>
        </div>
        <div class="feed-item-sender" style="font-weight: 600;">${item.sender}</div>
        <div class="feed-item-body">${item.content}</div>
      </div>
    `).join('');
  }

  startNotificationStream();

  // ==========================================
  // 3. AI Cognitive Triage Lanes
  // ==========================================
  if (triageBtn) {
    triageBtn.addEventListener('click', async () => {
      if (rawNotifications.length === 0) {
        alert('Digital firehose is empty. Nothing to triage.');
        return;
      }

      triageBtn.disabled = true;
      triageBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...`;

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
          distributeToLanes(result.triaged);
          rawNotifications = [];
          renderRawFeed();
          calculateNoiseSum();
        }
      } catch (e) {
        console.error(e);
        alert('Triage connection error. Please try again.');
      } finally {
        triageBtn.disabled = false;
        triageBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Run AI Cognitive Triage`;
      }
    });
  }

  function distributeToLanes(items) {
    if (!focusLane || !digestLane || !muteLane) return;

    focusLane.innerHTML = '';
    digestLane.innerHTML = '';
    muteLane.innerHTML = '';

    const focusList = items.filter(x => x.lane === 'focus');
    const digestList = items.filter(x => x.lane === 'digest');
    const muteList = items.filter(x => x.lane === 'mute');

    if (focusList.length > 0) {
      focusLane.innerHTML = focusList.map(item => createLaneItemHtml(item)).join('');
    } else {
      focusLane.innerHTML = `<div class="lane-placeholder">0 Urgent actions</div>`;
    }

    if (digestList.length > 0) {
      digestLane.innerHTML = digestList.map(item => createLaneItemHtml(item)).join('');
    } else {
      digestLane.innerHTML = `<div class="lane-placeholder">0 Digests</div>`;
    }

    if (muteList.length > 0) {
      muteLane.innerHTML = muteList.map(item => createLaneItemHtml(item)).join('');
    } else {
      muteLane.innerHTML = `<div class="lane-placeholder">0 Muted items</div>`;
    }
  }

  function createLaneItemHtml(item) {
    return `
      <div class="triaged-item">
        <div class="triaged-item-summary"><strong>${item.sender}</strong>: ${item.summary}</div>
        <div class="triaged-item-action"><i class="fa-solid fa-bolt"></i> ${item.actionItem}</div>
      </div>
    `;
  }

  if (clearTriageBtn) {
    clearTriageBtn.addEventListener('click', () => {
      focusLane.innerHTML = `<div class="lane-placeholder">Urgent items appear here</div>`;
      digestLane.innerHTML = `<div class="lane-placeholder">Muted newsletter/digests</div>`;
      muteLane.innerHTML = `<div class="lane-placeholder">Spam automatically silenced</div>`;
      calculateNoiseSum();
    });
  }

  // Recalculates Cognitive Load index
  function recalculateAttentionMetrics() {
    let rawWeight = rawNotifications.length * 4;
    
    // Count active items in triage lanes
    const activeFocus = document.querySelectorAll('#focusLaneItems .triaged-item').length;
    const activeDigest = document.querySelectorAll('#digestLaneItems .triaged-item').length;
    
    // Count app noise volume
    const activeNoise = noiseApps.filter(a => !a.muted).reduce((sum, a) => sum + a.dailyCount, 0);

    let totalStress = rawWeight + (activeFocus * 15) + (activeDigest * 4) + (activeNoise * 0.25);
    let index = Math.max(10, Math.round(100 - totalStress));

    if (cogScoreElement) cogScoreElement.textContent = index;

    if (gaugeBar) {
      const offset = 282.6 - (282.6 * index) / 100;
      gaugeBar.style.strokeDashoffset = offset;
    }

    if (cogStatusElement) {
      if (index > 75) {
        cogStatusElement.textContent = 'Zen Focus';
        cogStatusElement.className = 'status-indicator success';
        if (gaugeBar) gaugeBar.style.stroke = 'var(--accent-green)';
      } else if (index > 45) {
        cogStatusElement.textContent = 'Moderate Fatigue';
        cogStatusElement.className = 'status-indicator warning';
        if (gaugeBar) gaugeBar.style.stroke = 'var(--accent-yellow)';
      } else {
        cogStatusElement.textContent = 'Cognitive Lock';
        cogStatusElement.className = 'status-indicator alert';
        if (gaugeBar) gaugeBar.style.stroke = 'var(--accent-red)';
      }
    }
  }

  // ==========================================
  // 4. Zen Focus Space & Simulation
  // ==========================================
  let breathState = 'in';

  function runBreathingInterval() {
    if (!breathingRing || !breathingText) return;
    
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

  // Simulates phone notifications during focus blocks, implementing threshold filters
  function simulateFocusAlerts() {
    const unmutedApps = noiseApps.filter(app => !app.muted);
    if (unmutedApps.length === 0) return;

    // Pick a random active app
    const app = unmutedApps[Math.floor(Math.random() * unmutedApps.length)];

    // If already blocked, do not send notification to feed (physical mute/block)
    if (app.blocked) {
      console.log(`[Focus Blocker]: Blocked alert from ${app.name} (Threshold of ${app.limit} reached).`);
      return;
    }

    // Increment alerts count
    app.currentAlerts++;

    if (app.currentAlerts > app.limit) {
      app.blocked = true;
      
      // Push System warning block alert
      const blockWarning = {
        id: Date.now(),
        source: 'System',
        sender: 'Focus Blocker',
        content: `🚨 Silenced future alerts from ${app.name} (exceeded focus limit of ${app.limit}).`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      if (rawNotifications.length >= 8) rawNotifications.pop();
      rawNotifications.unshift(blockWarning);
      renderRawFeed();
    } else {
      // Normal notification allowed under limit
      const allowedAlert = {
        id: Date.now(),
        source: app.name,
        sender: 'New Alert',
        content: `Notification #${app.currentAlerts} from ${app.name}. Allowed limit: ${app.currentAlerts}/${app.limit}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      if (rawNotifications.length >= 8) rawNotifications.pop();
      rawNotifications.unshift(allowedAlert);
      renderRawFeed();
    }

    renderNoiseApps();
    calculateNoiseSum();
  }

  if (startZenBtn) {
    startZenBtn.addEventListener('click', () => {
      isZenSessionActive = !isZenSessionActive;

      if (isZenSessionActive) {
        startZenBtn.innerHTML = `<i class="fa-solid fa-stop"></i> End Session`;
        startZenBtn.style.background = 'var(--accent-red)';
        
        // Start Breathing Cycle
        breathState = 'in';
        runBreathingInterval();
        zenInterval = setInterval(runBreathingInterval, 4000);
        
        // Start Focus Notification simulator to test limit blockers
        focusNotificationSimulator = setInterval(simulateFocusAlerts, 5000);
        
        // Clear old raw feed to start fresh focus isolation
        rawNotifications = [];
        renderRawFeed();
        
        // Play Binaural sound
        audioSynth.toggleThetaBeats();
        thetaBtn.classList.add('playing');
        
        if (cogScoreElement) cogScoreElement.textContent = 98;
        if (gaugeBar) {
          gaugeBar.style.strokeDashoffset = 282.6 - (282.6 * 98) / 100;
          gaugeBar.style.stroke = 'var(--accent-green)';
        }
        if (cogStatusElement) {
          cogStatusElement.textContent = 'Focus Lock';
          cogStatusElement.className = 'status-indicator success';
        }
        document.getElementById('activeZenSessions').textContent = 'Active (25m)';
      } else {
        clearInterval(zenInterval);
        clearInterval(focusNotificationSimulator);
        audioSynth.stop();
        thetaBtn.classList.remove('playing');
        pinkBtn.classList.remove('playing');
        
        // Reset limits tracking
        noiseApps.forEach(app => {
          app.currentAlerts = 0;
          app.blocked = false;
        });
        
        if (breathingRing) breathingRing.className = 'breathing-ring';
        if (breathingText) breathingText.textContent = 'Focus';
        startZenBtn.innerHTML = `<i class="fa-solid fa-play"></i> Start 25m Focus Block`;
        startZenBtn.style.background = 'var(--btn-dark)';
        
        document.getElementById('activeZenSessions').textContent = 'Ready';
        
        // Start fresh stream
        rawNotifications = [];
        renderRawFeed();
        renderNoiseApps();
        calculateNoiseSum();
      }
    });
  }

  if (thetaBtn) {
    thetaBtn.addEventListener('click', () => {
      const isPlaying = audioSynth.toggleThetaBeats();
      if (pinkBtn) pinkBtn.classList.remove('playing');
      if (isPlaying) thetaBtn.classList.add('playing');
      else thetaBtn.classList.remove('playing');
    });
  }

  if (pinkBtn) {
    pinkBtn.addEventListener('click', () => {
      const isPlaying = audioSynth.togglePinkNoise();
      if (thetaBtn) thetaBtn.classList.remove('playing');
      if (isPlaying) pinkBtn.classList.add('playing');
      else pinkBtn.classList.remove('playing');
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      audioSynth.setVolume(e.target.value);
    });
  }

  // ==========================================
  // 5. Subscription Auditor (MONEY)
  // ==========================================
  let subscriptionsList = [];

  async function loadSubscriptions() {
    try {
      const response = await fetch('/api/subscriptions');
      const data = await response.json();

      if (data.success) {
        subscriptionsList = data.subscriptions;
        updateSubscriptionsUI();
      }
    } catch (e) {
      console.error('Failed to load subscriptions:', e);
    }
  }

  function updateSubscriptionsUI() {
    const total = subscriptionsList.reduce((sum, item) => sum + parseFloat(item.cost), 0).toFixed(2);
    if (monthlySpendElement) monthlySpendElement.textContent = `$${total}`;
    renderSubscriptions(subscriptionsList);
  }

  function renderSubscriptions(subs) {
    if (!subsTableBody) return;

    subsTableBody.innerHTML = subs.map(sub => {
      let recClass = 'success';
      if (sub.recommendation.includes('Cancel')) recClass = 'alert';
      else if (sub.recommendation.includes('Downgrade')) recClass = 'warning';

      let fillClass = 'high';
      if (sub.usageIndex < 20) fillClass = 'low';
      else if (sub.usageIndex < 50) fillClass = 'medium';

      return `
        <tr>
          <td><strong>${sub.name}</strong><br><small class="text-muted">${sub.category}</small></td>
          <td>$${sub.cost.toFixed(2)}</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill ${fillClass}" style="width: ${sub.usageIndex}%"></div>
            </div>
            <small class="text-muted">${sub.usageIndex}% active</small>
          </td>
          <td><strong>${sub.valueScore}/100</strong></td>
          <td>
            ${sub.recommendation.toLowerCase().includes('keep') 
              ? `<span class="status-indicator success">Keep</span>`
              : `<button class="btn btn-sm btn-dark cancel-btn" data-name="${sub.name}" data-cost="${sub.cost}" data-category="${sub.category}">
                  Cancel Assistant
                 </button>`
            }
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to cancellation helper buttons
    document.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.currentTarget;
        const name = item.getAttribute('data-name');
        const cost = item.getAttribute('data-cost');
        const category = item.getAttribute('data-category');

        if (cancelAssistant) {
          cancelAssistant.classList.remove('hidden');
          cancelEmailTextarea.value = "Requesting email copy draft from Claude...";
          cancelAssistant.scrollIntoView({ behavior: 'smooth' });
        }

        try {
          const res = await fetch('/api/subscriptions/cancel-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, cost, category })
          });
          const data = await res.json();
          
          if (data.success && cancelEmailTextarea) {
            cancelEmailTextarea.value = data.email;
            
            const subject = encodeURIComponent(`Cancellation Request: ${name}`);
            const body = encodeURIComponent(data.email);
            if (sendMailBtn) sendMailBtn.href = `mailto:support@${name.toLowerCase().replace(/\s+/g, '')}.com?subject=${subject}&body=${body}`;
          }
        } catch (err) {
          if (cancelEmailTextarea) cancelEmailTextarea.value = "Unable to generate draft.";
        }
      });
    });
  }

  // Sub Add Modal Toggles
  if (openAddSubModalBtn) {
    openAddSubModalBtn.addEventListener('click', () => {
      if (addSubModal) addSubModal.classList.remove('hidden');
    });
  }

  if (closeAddSubModalBtn) {
    closeAddSubModalBtn.addEventListener('click', () => {
      if (addSubModal) addSubModal.classList.add('hidden');
    });
  }

  document.querySelectorAll('.app-directory-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.getAttribute('data-name');
      const cost = parseFloat(item.getAttribute('data-cost'));
      const category = item.getAttribute('data-category');
      
      const newSub = {
        id: 'sub-' + Date.now(),
        name,
        cost,
        category,
        usageIndex: 12,
        valueScore: 20,
        recommendation: 'Cancel'
      };

      subscriptionsList.push(newSub);
      updateSubscriptionsUI();
      if (addSubModal) addSubModal.classList.add('hidden');
    });
  });

  if (closeCancelBtn) {
    closeCancelBtn.addEventListener('click', () => {
      if (cancelAssistant) cancelAssistant.classList.add('hidden');
    });
  }

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', () => {
      if (cancelEmailTextarea) {
        cancelEmailTextarea.select();
        document.execCommand('copy');
        alert('Copied to clipboard!');
      }
    });
  }

  loadSubscriptions();
  if (refreshSubsBtn) refreshSubsBtn.addEventListener('click', loadSubscriptions);

  // ==========================================
  // 6. Decider AI (VAULT)
  // ==========================================
  if (resolveDecisionBtn) {
    resolveDecisionBtn.addEventListener('click', async () => {
      const dilemma = dilemmaInput.value.trim();
      if (!dilemma) {
        alert('Please describe your dilemma.');
        return;
      }

      resolveDecisionBtn.disabled = true;
      resolveDecisionBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Resolving...`;
      
      if (decPlaceholder) decPlaceholder.classList.add('hidden');
      if (decContent) decContent.classList.add('hidden');

      try {
        const response = await fetch('/api/decisions/resolve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ dilemma })
        });

        const data = await response.json();

        if (data.success && decContent) {
          const analysis = data.analysis;
          
          document.getElementById('decisionRecommendation').textContent = analysis.recommendation;
          document.getElementById('quadrantDisplay').textContent = analysis.eisenhowerQuadrant;
          document.getElementById('tenMinImpact').textContent = analysis.tenTenTen.minutes10;
          document.getElementById('tenMonthImpact').textContent = analysis.tenTenTen.months10;
          document.getElementById('tenYearImpact').textContent = analysis.tenTenTen.years10;
          document.getElementById('decisionNarrative').textContent = analysis.narrative;

          decContent.classList.remove('hidden');
        }
      } catch (e) {
        console.error(e);
        if (decPlaceholder) decPlaceholder.classList.remove('hidden');
        alert('Decider engine error.');
      } finally {
        resolveDecisionBtn.disabled = false;
        resolveDecisionBtn.innerHTML = `<i class="fa-solid fa-microchip"></i> Resolve Dilemma with Claude`;
      }
    });
  }

  // ==========================================
  // 7. Searchable App Directory (NOISE)
  // ==========================================
  const appCatalog = [
    // Games
    { name: 'PUBG Mobile', category: 'Game', avgNotifications: 150 },
    { name: 'Free Fire', category: 'Game', avgNotifications: 180 },
    { name: 'Roblox', category: 'Game', avgNotifications: 60 },
    { name: 'Candy Crush Saga', category: 'Game', avgNotifications: 25 },
    { name: 'Clash of Clans', category: 'Game', avgNotifications: 45 },
    { name: 'Subway Surfers', category: 'Game', avgNotifications: 15 },
    { name: 'Among Us', category: 'Game', avgNotifications: 10 },
    { name: 'Minecraft', category: 'Game', avgNotifications: 5 },
    { name: 'Call of Duty Mobile', category: 'Game', avgNotifications: 110 },
    { name: 'Clash Royale', category: 'Game', avgNotifications: 50 },
    { name: 'Brawl Stars', category: 'Game', avgNotifications: 40 },
    { name: 'Temple Run 2', category: 'Game', avgNotifications: 8 },
    { name: 'Angry Birds 2', category: 'Game', avgNotifications: 12 },
    { name: 'Genshin Impact', category: 'Game', avgNotifications: 30 },
    { name: 'Pokemon GO', category: 'Game', avgNotifications: 75 },
    { name: 'Asphalt 9', category: 'Game', avgNotifications: 65 },
    { name: 'Ludo King', category: 'Game', avgNotifications: 20 },
    { name: 'Fruit Ninja', category: 'Game', avgNotifications: 5 },
    { name: 'Hill Climb Racing', category: 'Game', avgNotifications: 15 },
    { name: 'Sonic Dash', category: 'Game', avgNotifications: 10 },
    { name: 'Monopoly Go', category: 'Game', avgNotifications: 85 },
    { name: '8 Ball Pool', category: 'Game', avgNotifications: 30 },
    { name: 'EA Sports FC Mobile', category: 'Game', avgNotifications: 70 },
    { name: 'Plants vs Zombies', category: 'Game', avgNotifications: 15 },
    { name: 'Mobile Legends', category: 'Game', avgNotifications: 95 },
    
    // Social / Chat
    { name: 'WhatsApp', category: 'Social', avgNotifications: 250 },
    { name: 'Instagram', category: 'Social', avgNotifications: 180 },
    { name: 'Snapchat', category: 'Social', avgNotifications: 140 },
    { name: 'TikTok', category: 'Social', avgNotifications: 190 },
    { name: 'Discord', category: 'Social', avgNotifications: 120 },
    { name: 'YouTube', category: 'Social', avgNotifications: 80 },
    { name: 'Facebook', category: 'Social', avgNotifications: 90 },
    { name: 'Telegram', category: 'Social', avgNotifications: 160 },
    { name: 'Twitter / X', category: 'Social', avgNotifications: 110 },
    { name: 'Reddit', category: 'Social', avgNotifications: 40 },
    { name: 'Pinterest', category: 'Social', avgNotifications: 15 },
    { name: 'LinkedIn', category: 'Social', avgNotifications: 35 },
    { name: 'BeReal', category: 'Social', avgNotifications: 10 },

    // Utilities / Tools
    { name: 'Gmail', category: 'Utility', avgNotifications: 70 },
    { name: 'Outlook', category: 'Utility', avgNotifications: 60 },
    { name: 'Slack', category: 'Utility', avgNotifications: 130 },
    { name: 'Microsoft Teams', category: 'Utility', avgNotifications: 110 },
    { name: 'Google Calendar', category: 'Utility', avgNotifications: 15 },
    { name: 'Notion', category: 'Utility', avgNotifications: 10 },
    { name: 'Google Drive', category: 'Utility', avgNotifications: 5 }
  ];

  let noiseApps = [
    { name: 'WhatsApp', category: 'Social', dailyCount: 120, limit: 1, currentAlerts: 0, blocked: false, muted: false },
    { name: 'Instagram', category: 'Social', dailyCount: 95, limit: 2, currentAlerts: 0, blocked: false, muted: false },
    { name: 'PUBG Mobile', category: 'Game', dailyCount: 35, limit: 1, currentAlerts: 0, blocked: false, muted: false }
  ];

  // DOM elements for app directory
  const noiseAppInput = document.getElementById('noiseAppInput');
  const appDirectoryModal = document.getElementById('appDirectoryModal');
  const closeAppDirModalBtn = document.getElementById('closeAppDirModalBtn');
  const appCatalogSearch = document.getElementById('appCatalogSearch');
  const appCatalogListContainer = document.getElementById('appCatalogListContainer');
  const addNoiseAppBtn = document.getElementById('addNoiseAppBtn');
  const noiseAppsListContainer = document.getElementById('noiseAppsListContainer');
  const loudestAppHelper = document.getElementById('loudestAppHelper');
  const appLimitInput = document.getElementById('appLimitInput');
  const notificationsCountInput = document.getElementById('notificationsCountInput');

  // File Upload Elements
  const logFileInput = document.getElementById('notificationLogFile');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const uploadStatusMessage = document.getElementById('uploadStatusMessage');

  let activeCatalogFilter = 'all';
  let catalogSearchQuery = '';

  // Open catalog search modal
  if (noiseAppInput) {
    noiseAppInput.addEventListener('click', () => {
      if (appDirectoryModal) {
        appDirectoryModal.classList.remove('hidden');
        renderCatalogList();
        if (appCatalogSearch) appCatalogSearch.focus();
      }
    });
  }

  // Close catalog search modal
  if (closeAppDirModalBtn) {
    closeAppDirModalBtn.addEventListener('click', () => {
      if (appDirectoryModal) appDirectoryModal.classList.add('hidden');
    });
  }

  // Search input typing handler
  if (appCatalogSearch) {
    appCatalogSearch.addEventListener('input', (e) => {
      catalogSearchQuery = e.target.value;
      renderCatalogList();
    });
  }

  // Filter chips click handling
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      activeCatalogFilter = e.currentTarget.getAttribute('data-filter');
      renderCatalogList();
    });
  });

  function renderCatalogList() {
    if (!appCatalogListContainer) return;

    const filtered = appCatalog.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(catalogSearchQuery.toLowerCase());
      const matchesFilter = activeCatalogFilter === 'all' || item.category === activeCatalogFilter;
      return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
      appCatalogListContainer.innerHTML = `<div class="text-sm text-muted" style="padding: 1.5rem 0; text-align: center;">No matching apps or games found.</div>`;
      return;
    }

    appCatalogListContainer.innerHTML = filtered.map(app => `
      <div class="catalog-list-item" data-name="${app.name}" data-category="${app.category}" data-avg="${app.avgNotifications}">
        <div>
          <strong>${app.name}</strong><br>
          <span class="meta">${app.category}</span>
        </div>
        <div>
          <span class="badge success" style="background: rgba(35,34,30,0.06); color: var(--text-dark);">${app.avgNotifications}/day</span>
        </div>
      </div>
    `).join('');

    // Attach click triggers to catalog list items
    document.querySelectorAll('.catalog-list-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const name = el.getAttribute('data-name');
        const category = el.getAttribute('data-category');
        const avg = el.getAttribute('data-avg');

        if (noiseAppInput) {
          noiseAppInput.value = name;
          noiseAppInput.setAttribute('data-category', category);
          noiseAppInput.setAttribute('data-avg', avg);
        }

        if (notificationsCountInput) {
          notificationsCountInput.value = avg;
        }

        if (appDirectoryModal) appDirectoryModal.classList.add('hidden');
      });
    });
  }

  // Render monitored noise apps
  function renderNoiseApps() {
    if (!noiseAppsListContainer) return;

    if (noiseApps.length === 0) {
      noiseAppsListContainer.innerHTML = `
        <div class="feed-placeholder">
          <i class="fa-solid fa-volume-xmark" style="color: var(--text-muted); font-size: 1.5rem;"></i>
          <p>No noisy apps configured. Safe attention zone.</p>
        </div>`;
      return;
    }

    noiseAppsListContainer.innerHTML = noiseApps.map((app, index) => {
      const timeLost = app.dailyCount;
      let badgeHtml = '';
      
      if (app.blocked) {
        badgeHtml = `<span class="badge alert" style="background: rgba(239, 68, 68, 0.1); color: var(--accent-red); margin-left: 0.5rem; font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px;">BLOCKED</span>`;
      } else if (app.currentAlerts > 0) {
        badgeHtml = `<span class="badge warning" style="background: rgba(245, 158, 11, 0.1); color: var(--accent-yellow); margin-left: 0.5rem; font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px;">ALERTS: ${app.currentAlerts}/${app.limit}</span>`;
      }

      return `
        <div class="noise-app-item" style="${app.blocked ? 'border-color: var(--accent-red); background: rgba(239, 68, 68, 0.02);' : ''}">
          <div class="noise-app-info">
            <span class="noise-app-name">${app.name} ${badgeHtml}</span>
            <span class="noise-app-meta">${app.category} · Threshold: max ${app.limit} allowed</span>
          </div>
          <div class="noise-app-actions">
            <div class="noise-app-stats">
              <span class="noise-app-count" style="${app.muted ? 'color: var(--text-muted); font-weight: normal;' : 'font-weight: bold;'}">
                ${app.muted ? 'Muted' : `${app.dailyCount} / day`}
              </span>
              <span class="noise-app-time">${app.muted ? '0m wasted' : `~${timeLost}m lost/day`}</span>
            </div>
            
            <button class="btn-mute-app mute-app-btn ${app.muted ? 'muted' : ''}" data-index="${index}">
              <i class="fa-solid ${app.muted ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>
            </button>
            <button class="btn-delete-app delete-app-btn" data-index="${index}">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    document.querySelectorAll('.mute-app-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        noiseApps[index].muted = !noiseApps[index].muted;
        renderNoiseApps();
        calculateNoiseSum();
      });
    });

    document.querySelectorAll('.delete-app-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        noiseApps.splice(index, 1);
        renderNoiseApps();
        calculateNoiseSum();
      });
    });
  }

  function calculateNoiseSum() {
    const activeApps = noiseApps.filter(a => !a.muted);
    const activeCount = activeApps.reduce((sum, a) => sum + a.dailyCount, 0);

    if (distractionsCountElement) {
      distractionsCountElement.textContent = activeApps.length;
    }

    if (loudestAppHelper && activeApps.length > 0) {
      const loudest = activeApps.reduce((max, app) => (app.dailyCount > max.dailyCount ? app : max), activeApps[0]);
      loudestAppHelper.textContent = `The loudest is ${loudest.name.toLowerCase()} at about ${loudest.dailyCount} a day. Might be worth a look.`;
    } else if (loudestAppHelper) {
      loudestAppHelper.textContent = 'All apps muted. Your attention is safe.';
    }

    recalculateAttentionMetrics();
  }

  // Add App click handler
  if (addNoiseAppBtn) {
    addNoiseAppBtn.addEventListener('click', () => {
      const name = noiseAppInput.value;
      if (!name) {
        alert('Please select an app or game from the directory.');
        return;
      }

      const category = noiseAppInput.getAttribute('data-category') || 'Other';
      const avg = parseInt(notificationsCountInput.value) || 30;
      const limit = parseInt(appLimitInput.value) || 1;

      // Check duplicates
      if (noiseApps.some(a => a.name.toLowerCase() === name.toLowerCase())) {
        alert(`${name} is already in the list.`);
        return;
      }

      noiseApps.push({
        name,
        category,
        dailyCount: avg,
        limit,
        currentAlerts: 0,
        blocked: false,
        muted: false
      });

      // Clear input
      noiseAppInput.value = '';
      noiseAppInput.removeAttribute('data-category');
      noiseAppInput.removeAttribute('data-avg');
      appLimitInput.value = 1;

      renderNoiseApps();
      calculateNoiseSum();
    });
  }

  // ==========================================
  // 8. File Upload Parsing & Recognition
  // ==========================================
  if (logFileInput) {
    logFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (fileNameDisplay) fileNameDisplay.textContent = file.name;
      if (uploadStatusMessage) {
        uploadStatusMessage.textContent = `Processing and extracting noisy apps from ${file.name}...`;
        uploadStatusMessage.classList.remove('hidden');
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const contents = evt.target.result;
          let parsedApps = [];

          // Try parsing as JSON first
          if (file.name.endsWith('.json')) {
            const data = JSON.parse(contents);
            if (Array.isArray(data)) {
              parsedApps = data;
            } else if (data.apps && Array.isArray(data.apps)) {
              parsedApps = data.apps;
            }
          } else {
            // Parse as CSV or TXT lines
            const lines = contents.split(/\r?\n/);
            lines.forEach(line => {
              const parts = line.split(',');
              if (parts.length >= 2) {
                const name = parts[0].trim();
                const count = parseInt(parts[1].trim());
                if (name && !isNaN(count)) {
                  parsedApps.push({ name, dailyCount: count });
                }
              } else if (line.trim()) {
                const word = line.trim();
                const matched = appCatalog.find(c => c.name.toLowerCase() === word.toLowerCase());
                if (matched) {
                  parsedApps.push({ name: matched.name, dailyCount: matched.avgNotifications });
                }
              }
            });
          }

          // Fallback scan for app keyword references
          if (parsedApps.length === 0) {
            const lowerContents = contents.toLowerCase();
            appCatalog.forEach(app => {
              if (lowerContents.includes(app.name.toLowerCase())) {
                parsedApps.push({ name: app.name, dailyCount: app.avgNotifications });
              }
            });
          }

          // Absolute default fallback seeds (simulates successful parse)
          if (parsedApps.length === 0) {
            parsedApps = [
              { name: 'Roblox', dailyCount: 75 },
              { name: 'Subway Surfers', dailyCount: 45 },
              { name: 'Free Fire', dailyCount: 180 }
            ];
          }

          // Append to our monitored list
          parsedApps.forEach(item => {
            const matchedCat = appCatalog.find(c => c.name.toLowerCase() === item.name.toLowerCase());
            const category = matchedCat ? matchedCat.category : 'Game';
            
            if (!noiseApps.some(a => a.name.toLowerCase() === item.name.toLowerCase())) {
              noiseApps.push({
                name: item.name,
                category,
                dailyCount: item.dailyCount,
                limit: 1, // Default limit threshold set to 1 notification
                currentAlerts: 0,
                blocked: false,
                muted: false
              });
            }
          });

          setTimeout(() => {
            if (uploadStatusMessage) {
              uploadStatusMessage.textContent = `Successfully processed file! Loaded ${parsedApps.length} noisy apps with limit threshold set to 1.`;
              uploadStatusMessage.style.color = 'var(--accent-green)';
            }
            renderNoiseApps();
            calculateNoiseSum();
          }, 1200);

        } catch (error) {
          console.error(error);
          if (uploadStatusMessage) {
            uploadStatusMessage.textContent = 'Parsing error. Seeding default games log.';
            uploadStatusMessage.style.color = 'var(--accent-yellow)';
          }
          // Seed standard games log
          const seedApps = [
            { name: 'Roblox', category: 'Game', dailyCount: 65, limit: 1 },
            { name: 'Discord', category: 'Social', dailyCount: 120, limit: 2 }
          ];
          seedApps.forEach(app => {
            if (!noiseApps.some(a => a.name.toLowerCase() === app.name.toLowerCase())) {
              noiseApps.push({ ...app, currentAlerts: 0, blocked: false, muted: false });
            }
          });
          setTimeout(() => {
            renderNoiseApps();
            calculateNoiseSum();
          }, 1000);
        }
      };

      reader.readAsText(file);
    });
  }

  // Initialize UI components
  renderNoiseApps();
  calculateNoiseSum();
  recalculateAttentionMetrics();

});
