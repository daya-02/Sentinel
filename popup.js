document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const trendsBtn = document.getElementById('trendsBtn');
  const loadingDiv = document.getElementById('loading');
  const resultsDiv = document.getElementById('results');
  const errorDiv = document.getElementById('error');

  // Collapsible logic
  const setupCollapsible = (btnId, contentId, indicatorId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const content = document.getElementById(contentId);
      const indicator = document.getElementById(indicatorId);
      content.classList.toggle('active');
      indicator.innerHTML = content.classList.contains('active') ? '&#9650;' : '&#9660;';
    });
  };

  setupCollapsible('sourceBtn', 'sourceContent', 'sourceIndicator');
  setupCollapsible('reasoningBtn', 'reasoningContent', 'reasoningIndicator');

  // Open Dashboard
  trendsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  // Analyze page logic
  analyzeBtn.addEventListener('click', async () => {
    loadingDiv.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    analyzeBtn.disabled = true;

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found.');
      }

      // Execute content script to scrape text
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // A very basic extraction that content.js could also do. 
          // We will extract text to analyze.
          return document.body.innerText;
        }
      });

      const pageText = injectionResults[0].result;
      if (!pageText || pageText.trim() === '') {
        throw new Error('Could not extract any text from the page.');
      }

      // We'll limit text length to avoid token limits
      const extractedText = pageText.substring(0, 3000); 

      // Send to background script for Groq API analysis
      chrome.runtime.sendMessage(
        { action: 'analyze_text', text: extractedText },
        (response) => {
          loadingDiv.classList.add('hidden');
          analyzeBtn.disabled = false;

          if (chrome.runtime.lastError) {
            showError('Extension error: ' + chrome.runtime.lastError.message);
            return;
          }

          if (response && response.success) {
            displayResults(response.data);
            
            // Highlight flagged phrases in the active tab
            if (response.data.flagged_phrases && response.data.flagged_phrases.length > 0) {
              chrome.tabs.sendMessage(tab.id, { 
                action: 'highlight_phrases', 
                phrases: response.data.flagged_phrases 
              }, (hlResponse) => {
                // Ignore any error here, content script might just be busy
              });
            }
          } else {
            showError(response ? response.error : 'Unknown error occurred.');
          }
        }
      );
    } catch (err) {
      loadingDiv.classList.add('hidden');
      analyzeBtn.disabled = false;
      showError(err.message);
    }
  });

  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
  }

  function displayResults(data) {
    resultsDiv.classList.remove('hidden');

    // EMS Score
    const emsScoreEl = document.getElementById('emsScore');
    const scoreCard = document.getElementById('scoreCard');
    const verdictText = document.getElementById('verdictText');
    const confidenceBadge = document.getElementById('confidenceBadge');
    const emotionDetected = document.getElementById('emotionDetected');

    emsScoreEl.textContent = data.ems_score;
    verdictText.textContent = data.verdict;
    emotionDetected.textContent = data.emotion_detected || 'Unknown';

    // Confidence badge color
    confidenceBadge.textContent = data.confidence || 'Medium';

    // Set colors based on score
    let borderColor = 'var(--text-secondary)';
    let textColor = 'var(--safe-color)'; // default
    if (data.ems_score <= 30) {
      borderColor = 'var(--safe-color)';
      textColor = 'var(--safe-color)';
    } else if (data.ems_score <= 60) {
      borderColor = 'var(--suspicious-color)';
      textColor = 'var(--suspicious-color)';
    } else if (data.ems_score <= 80) {
      borderColor = 'var(--manipulative-color)';
      textColor = 'var(--manipulative-color)';
    } else {
      borderColor = 'var(--highly-manipulative-color)';
      textColor = 'var(--highly-manipulative-color)';
    }

    scoreCard.style.borderColor = borderColor;
    verdictText.style.color = textColor;

    // Counter Narrative
    const cCard = document.getElementById('counterNarrativeCard');
    const cText = document.getElementById('counterNarrativeText');
    if (data.ems_score > 40 && data.counter_narrative) {
      cText.textContent = data.counter_narrative;
      cCard.classList.remove('hidden');
    } else {
      cCard.classList.add('hidden');
    }

    // Reasoning & Tactics
    document.getElementById('reasoningText').textContent = data.reasoning || '--';
    const tacticsList = document.getElementById('tacticsList');
    tacticsList.innerHTML = '';
    if (data.tactics_detected && Array.isArray(data.tactics_detected)) {
      data.tactics_detected.forEach(t => {
        const li = document.createElement('li');
        li.textContent = t;
        tacticsList.appendChild(li);
      });
    }

    // Source Profile (using dummy logic to derive account from text until full post scraping is perfect)
    // We will extract host name from current tab in background, and background has fed it back, OR we can do it here.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extract_username' }, (response) => {
          let username = "Unknown Source";
          if (!chrome.runtime.lastError && response && response.username) {
            username = response.username;
          }
          
          // Update the local storage with this new score and tactic to maintain intelligence
          updateSourceIntelligence(username, data);
        });
      } else {
        updateSourceIntelligence("Unknown Source", data);
      }
    });
  }

  function updateSourceIntelligence(accountName, data) {
    chrome.storage.local.get(['sentinel_sources'], (result) => {
      let sources = result.sentinel_sources || {};
      
      if (!sources[accountName]) {
        sources[accountName] = {
          scores: [],
          tactics: [],
          average_ems: 0,
          credibility_tier: "Trusted",
          dominant_tactic: "None"
        };
      }

      let source = sources[accountName];
      source.scores.push(data.ems_score);
      // Keep last 10 scores
      if (source.scores.length > 10) {
        source.scores.shift();
      }

      if (data.tactics_detected) {
        source.tactics.push(...data.tactics_detected);
      }

      // Calculate Average EMS
      const sum = source.scores.reduce((a, b) => a + b, 0);
      source.average_ems = Math.round(sum / source.scores.length);

      // Credibility Tier
      if (source.average_ems <= 30) source.credibility_tier = "Trusted";
      else if (source.average_ems <= 60) source.credibility_tier = "Questionable";
      else source.credibility_tier = "Known Disinfo";

      // Dominant Tactic
      if (source.tactics.length > 0) {
        const frequency = {};
        source.tactics.forEach(t => {
            frequency[t] = (frequency[t] || 0) + 1;
        });
        source.dominant_tactic = Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
      }

      // Save back to storage
      sources[accountName] = source;
      chrome.storage.local.set({ sentinel_sources: sources }, () => {
        // Now update UI
        document.getElementById('accountName').textContent = accountName;
        document.getElementById('credibilityTier').textContent = source.credibility_tier;
        document.getElementById('averageEms').textContent = source.average_ems;
        document.getElementById('dominantTactic').textContent = source.dominant_tactic;
      });
    });
  }
});
