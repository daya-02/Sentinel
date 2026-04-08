// Import the config file for the API key in Manifest V3
ScriptsLoaded = false;
try {
  importScripts('config.js');
  ScriptsLoaded = true;
} catch (e) {
  console.error("Failed to load config.js. Ensure config.js exists.");
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyze_text') {
    handleAnalysis(request.text)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('Analysis error:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep the message channel open for async response
  }
});

async function handleAnalysis(text) {
  if (!CONFIG || !CONFIG.GROQ_API_KEY || CONFIG.GROQ_API_KEY === "YOUR_GROQ_API_KEY_HERE") {
    throw new Error('Groq API Key is missing. Please configure it in config.js.');
  }

  const prompt = `You are SENTINEL, an AI that detects manipulative digital content.
Emotional tone is NOT manipulation. Detect when emotion is weaponized 
to bypass critical thinking — when emotional intensity outpaces factual 
evidence.

Analyze the post across TWO axes:

AXIS 1 - EMOTIONAL INTENSITY (0-100):
- Urgency language (BREAKING, ACT NOW, SHOCKING)
- Fear, anger, outrage-inducing framing
- Sensationalist or hyperbolic vocabulary
- All-caps, excessive punctuation, dramatic tone

AXIS 2 - FACTUAL INTEGRITY (0-100):
- Are specific verifiable facts present (names, dates, sources)?
- Are claims vague or unverifiable?
- Are weasel words used (sources say, many people believe)?
- Is a named credible source cited?

EMS FORMULA: (Emotional Intensity × (100 - Factual Integrity)) / 100

HIGH Emotion + LOW Facts = HIGH EMS (manipulative)
HIGH Emotion + HIGH Facts = LOW EMS (legitimate urgent news)

TACTICS CHECKLIST - detect if present:
1. Fear Mongering
2. False Urgency
3. Scapegoating
4. Bandwagon
5. Cherry Picking
6. AI-Generated Content Indicators

Return ONLY valid JSON, no markdown, no explanation:
{
  "emotional_intensity": <0-100>,
  "factual_integrity": <0-100>,
  "ems_score": <0-100>,
  "emotion_detected": "<Fear|Anger|Outrage|Panic|Disgust|Neutral>",
  "verdict": "<Safe|Suspicious|Manipulative|Highly Manipulative>",
  "tactics_detected": ["<tactic>"],
  "flagged_phrases": ["<exact phrase from post>"],
  "reasoning": "<2-3 sentence human readable explanation>",
  "counter_narrative": "<calm factual rewrite of the same headline>",
  "confidence": "<Low|Medium|High>"
}

POST TO ANALYZE:
"""
${text}
"""`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are an API that outputs ONLY raw valid JSON format and nothing else.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Groq API Error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  try {
    const structuredContent = data.choices[0].message.content;
    const parsedData = JSON.parse(structuredContent);
    return parsedData;
  } catch (e) {
    console.error("Raw response:", data.choices[0].message.content);
    throw new Error('Failed to parse JSON response from Groq API. Model output was not valid JSON.');
  }
}
