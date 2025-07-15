document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copyBtn');
  const redoBtn = document.getElementById('redoBtn');
  const summaryDiv = document.getElementById('summary');

  // Load from storage
  chrome.storage.local.get(['lastSummary', 'lastVideoId'], (result) => {
    if (result.lastVideoId) {
      document.title = `Summary for ${result.lastVideoId}`;
    }
    if (result.lastSummary && summaryDiv) {
      summaryDiv.innerHTML = result.lastSummary;
    }
  });

  if (copyBtn && summaryDiv) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(summaryDiv.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Summary Again';
        }, 2000);
      });
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({ type: 'REDO_SUMMARY' });
        window.close();
      } else {
        alert('Please reopen the extension popup to redo the summary.');
      }
    });
  }
}); 