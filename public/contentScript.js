console.log('YT Wrap content script loaded!');

function getVideoIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('v');
}

function getTranscriptFromPage() {
  // Use the correct selector for transcript text
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('YT Wrap: received message', request);
  if (request.type === 'GET_VIDEO_ID') {
    const videoId = getVideoIdFromUrl();
    const transcript = getTranscriptFromPage();
    sendResponse({ 
      videoId: videoId,
      transcript: transcript 
    });
  }
});