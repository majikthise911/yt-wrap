<script lang="ts">
  let loading = false;
  let error = '';

  async function handleShowTranscript() {
    loading = true;
    error = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      const videoId = response.videoId;
      const transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');

      // Format transcript: insert line breaks at sentence boundaries
      function formatTranscript(text: string) {
        // Insert a line break after . ! ? followed by a space or end of string
        return text.replace(/([.!?])\s+/g, '$1\n');
      }
      const formattedTranscript = formatTranscript(transcript);

      // Copy to clipboard in the popup
      await navigator.clipboard.writeText(formattedTranscript);

      // Open a new tab and display the transcript (no copy button needed)
      const transcriptHtml = `<html><head><meta charset="UTF-8"><title>Transcript for ${videoId}</title><style>body { font-family: system-ui, sans-serif; background: #f9f9f9; margin: 0; padding: 0; } .container { max-width: 800px; margin: 40px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px 24px; } .copied-msg { color: #16a34a; margin-bottom: 24px; font-size: 1rem; vertical-align: middle; display: block; } pre { background: #f3f4f6; border-radius: 6px; padding: 20px; font-size: 1.05rem; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }</style></head><body><div class="container"><span class="copied-msg">Transcript copied to clipboard!</span><pre>${formattedTranscript.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div></body></html>`;
      const blob = new Blob([transcriptHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<main class="p-4 w-80">
  <h1 class="text-lg font-bold mb-2">YT Wrap</h1>
  <button
    on:click={handleShowTranscript}
    disabled={loading}
    class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded flex items-center"
  >
    {#if loading}
      <svg class="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
      Loading transcript...
    {:else}
      Show Full Transcript
    {/if}
  </button>

  {#if error}
    <p class="text-red-600 text-sm mt-2">{error}</p>
  {/if}
</main>

