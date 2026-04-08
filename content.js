chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'highlight_phrases') {
    const phrases = request.phrases;
    if (!phrases || phrases.length === 0) {
      sendResponse({ status: 'no phrases' });
      return;
    }

    highlightPhrasesInDOM(phrases);
    sendResponse({ status: 'success' });
  } else if (request.action === 'extract_username') {
    let username = "Unknown Source";
    const s1 = document.querySelector('header a[role="link"]')?.innerText;
    const s2 = document.querySelector('article a[href^="/"]')?.innerText;
    const s3 = window.location.pathname.split('/')[1];

    if (s1) {
      username = s1;
    } else if (s2) {
      username = s2;
    } else if (s3) {
      username = s3;
    }

    sendResponse({ username });
  }
  return true;
});

function highlightPhrasesInDOM(phrases) {
  // Sort phrases by length descending so we match longer phrases first and avoid partial matches
  const sortedPhrases = phrases
    .filter(p => typeof p === 'string' && p.trim().length > 3)
    .sort((a, b) => b.length - a.length);
  
  if (sortedPhrases.length === 0) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  const nodesToReplace = [];
  
  let node;
  while (node = walker.nextNode()) {
    // Skip text inside scripts, styles, or our own previously injected spans
    if (node.parentElement && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(node.parentElement.tagName)) {
      continue;
    }
    
    // Also skip nodes that are already highlighted
    if (node.parentElement && node.parentElement.getAttribute('data-sentinel-highlight')) {
        continue;
    }

    let text = node.nodeValue;
    let modified = false;
    
    for (const phrase of sortedPhrases) {
      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapeRegExp(phrase)})`, 'gi');
      if (regex.test(text)) {
        modified = true;
      }
    }
    
    if (modified) {
      nodesToReplace.push(node);
    }
  }

  nodesToReplace.forEach(textNode => {
    if (!textNode.parentElement) return;
    
    let html = textNode.nodeValue;
    
    sortedPhrases.forEach(phrase => {
      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapeRegExp(phrase)})`, 'gi');
      html = html.replace(regex, `<span data-sentinel-highlight="true" style="background-color: rgba(239, 68, 68, 0.3); border-bottom: 2px solid #ef4444; font-weight: bold; color: inherit;">$1</span>`);
    });
    
    const wrapper = document.createElement('span');
    wrapper.innerHTML = html;
    textNode.parentElement.replaceChild(wrapper, textNode);
  });
}
