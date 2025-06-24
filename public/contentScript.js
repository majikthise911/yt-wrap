console.log('YT Wrap content script loaded!');

function getVideoIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('v');
}

function getTranscriptFromPage() {
  const transcriptTexts = document.querySelectorAll('.segment-text');
  console.log('YT Wrap: .segment-text count:', transcriptTexts.length);
  if (transcriptTexts.length > 0) {
    return Array.from(transcriptTexts).map(el => el.textContent.trim()).join(' ');
  }
  // Fallback: look for any text in transcript-related containers
  const transcriptContainer = document.querySelector('ytd-transcript-renderer');
  if (transcriptContainer) {
    const allText = transcriptContainer.textContent;
    if (allText && allText.length > 100) {
      return allText;
    }
  }
  return null;
}

async function waitForSelector(selector, timeout = 3000) {
  const interval = 100;
  let elapsed = 0;
  while (elapsed < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise(res => setTimeout(res, interval));
    elapsed += interval;
  }
  return null;
}

async function openTranscriptPanelIfNeeded() {
  // Check if transcript panel is already open
  if (document.querySelector('.segment-text')) {
    return true;
  }

  // 1. Wait for and click the ...more button if present
  const moreButton = await waitForSelector('tp-yt-paper-button#expand');
  if (moreButton && moreButton.textContent && moreButton.textContent.trim().toLowerCase() === '...more') {
    console.log('YT Wrap: Clicking ...more button');
    moreButton.click();
    await new Promise(res => setTimeout(res, 500));
  }

  // 2. Wait for and click the "Show transcript" button
  let transcriptButton = null;
  for (let i = 0; i < 30; i++) { // Wait up to 3 seconds
    transcriptButton = document.querySelector('button[aria-label="Show transcript"]');
    if (!transcriptButton) {
      // fallback: look for button with text content
      transcriptButton = Array.from(document.querySelectorAll('button, ytd-button-renderer, tp-yt-paper-button, a'))
        .find(btn => btn.textContent && btn.textContent.toLowerCase().includes('show transcript'));
    }
    if (transcriptButton) break;
    await new Promise(res => setTimeout(res, 100));
  }
  if (transcriptButton) {
    console.log('YT Wrap: Clicking Show transcript button');
    transcriptButton.click();
    // Wait for transcript panel to load
    for (let i = 0; i < 20; i++) {
      if (document.querySelector('.segment-text')) return true;
      await new Promise(res => setTimeout(res, 100));
    }
  }
  return false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    console.log('YT Wrap: received message', request);
    if (request.type === 'GET_VIDEO_ID') {
      const videoId = getVideoIdFromUrl();
      const panelOpened = await openTranscriptPanelIfNeeded();
      const transcript = getTranscriptFromPage();
      sendResponse({ 
        videoId: videoId,
        transcript: transcript,
        panelOpened: panelOpened
      });
    }
  })();
  // Return true to indicate async response
  return true;
});