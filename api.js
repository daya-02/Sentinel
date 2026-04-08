async function analyzeTextWithAI(text, apiKey) {
    console.log("TEXT:", text);

    const prompt = `Return ONLY JSON.

TEXT: "${text}"

{
"emotion": "Fear | Anger | Aspirational | Neutral",
"manipulation_score": number,
"explanation": ["point1","point2","point3"]
}`;

    try {
        const response = await fetch(
            "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 200,
                        temperature: 0.2,
                        return_full_text: false
                    }
                })
            }
        );

        const data = await response.json();
        console.log("API RAW:", data);

        let raw = data?.[0]?.generated_text || "";
        raw = raw.trim();

        // 🔥 STRONG CLEANING
        raw = raw
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .replace(/\n/g, "")
            .trim();

        // Extract JSON safely
        console.log("CLEANED TEXT:", raw);
        const match = raw.match(/\{.*\}/);

        if (!match) {
            console.log("No JSON found");
            return null;
        }

        let parsed;
        try {
            parsed = JSON.parse(match[0]);
        } catch (e) {
            console.log("JSON parse failed:", e);
            return null;
        }

        console.log("PARSED:", parsed);

        return {
            score: parsed.manipulation_score ?? 40,
            emotion: parsed.emotion ?? "Neutral",
            explanation: parsed.explanation ?? ["AI response incomplete"]
        };

    } catch (err) {
        console.log("API ERROR:", err);
        return null;
    }
}

function analyzeTextFallback(text) {
    console.log("Using FALLBACK LOGIC for text:", text);
    let score = 0;
    
    if (!text || text.trim() === '') {
        return {
            emotion: "Neutral",
            score: 20,
            explanation: ["No meaningful text could be extracted to analyze."]
        };
    }
    
    if (/urgent|breaking|now|48 hours/i.test(text)) score += 30;
    if (/threat|danger|crisis/i.test(text)) score += 25;
    if (/mentor|success|rich|life/i.test(text)) score += 20;
    if (/shocking|never|unbelievable/i.test(text)) score += 15;
    if (/!{2,}/.test(text)) score += 10;
    
    score = Math.max(score, 20); // Minimum score 20
    score = Math.min(score, 100);
    
    let emotion = "Neutral";
    if (/threat|danger|crisis|fear|panic|urgent|breaking/i.test(text)) {
        emotion = "Fear";
    } else if (/anger|outrage|hate|stupid|idiot/i.test(text)) {
        emotion = "Anger";
    } else if (/mentor|success|rich|life|achieve/i.test(text)) {
        emotion = "Aspirational";
    } else {
        emotion = "Neutral";
    }
    
    let explanation = [];
    if (/urgent|breaking|now|48 hours/i.test(text)) explanation.push("Urgency language detected (breaking/now)");
    if (/threat|danger|crisis/i.test(text)) explanation.push("Fear-inducing vocabulary detected");
    if (/mentor|success|rich|life/i.test(text)) explanation.push("Aspirational or 'get rich' language detected");
    if (/shocking|never|unbelievable/i.test(text)) explanation.push("Sensationalist language detected");
    if (/!{2,}/.test(text)) explanation.push("Repeated punctuation detected (excessive exclamation marks)");
    
    if (explanation.length === 0) {
        explanation.push("Text structure does not match standard manipulation patterns.");
    }
    
    return {
        score: score,
        emotion: emotion,
        explanation: explanation.slice(0, 3)
    };
}

async function analyzeFinal(text, apiKey) {
    let aiResult = null;
    if (apiKey) {
        aiResult = await analyzeTextWithAI(text, apiKey);
    }
    
    let fallback = analyzeTextFallback(text);
    
    console.log("AI RESULT:", aiResult);
    console.log("FALLBACK RESULT:", fallback);

    let final = {
        score: fallback.score || 0,
        emotion: fallback.emotion || "Neutral",
        explanation: fallback.explanation || []
    };

    if (aiResult) {
        // If AI works -> use AI emotion
        final.emotion = aiResult.emotion || fallback.emotion;
        
        // Score = max(AI score, fallback score)
        final.score = Math.max(aiResult.score || 0, fallback.score || 0);
        
        // If AI explanation exists -> use it
        if (aiResult.explanation && aiResult.explanation.length > 0 && aiResult.explanation[0] !== "AI response incomplete") {
            final.explanation = aiResult.explanation;
        } else {
            final.explanation = fallback.explanation;
        }
    }

    console.log("FINAL OUTPUT:", final);
    return final;
}
