<script lang="ts">
  let summary = '';
  let loading = false;
  let error = '';

  async function handleSummarize() {
    loading = true;
    summary = '';
    error = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      const videoId = response.videoId;
      const transcript = response.transcript;

      if (!videoId) {
        throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      }

      if (!transcript) {
        throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');
      }

      summary = transcript.slice(0, 1500) + '...';
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
    on:click={handleSummarize}
    disabled={loading}
    class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
  >
    {loading ? 'Summarizing...' : 'Summarize Video'}
  </button>

  {#if error}
    <p class="text-red-600 text-sm mt-2">{error}</p>
  {/if}

  {#if summary}
    <h2 class="mt-4 font-semibold">Transcript Preview</h2>
    <p class="text-sm mt-2">{summary}</p>
  {/if}
</main>

