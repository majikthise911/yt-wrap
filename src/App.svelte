<script lang="ts">
  import OpenAI from 'openai';
  import { marked } from 'marked';
  import { createTranscriptHtml } from './lib/htmlTemplates';
  import { onMount } from 'svelte';

  let loading = false;
  let error = '';
  let summaryLoading = false;
  let summaryError = '';
  let savedApiKey = '';
  let isApiKeySet = false;

  let showTranscript = false;
  let showSummary = false;
  let transcriptContent = '';
  let summaryContent = '';
  let videoId = '';
  let progress = 0;
  let progressMessage = '';

  let queryLoading = false;
  let queryError = '';
  let showQueryResponse = false;
  let userQuery = '';
  let queryResponseContent = '';
  let qaLog = [];

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: '', // This will be set by the user
    dangerouslyAllowBrowser: true
  });

  // Load saved API key on component mount
  async function loadSavedApiKey() {
    try {
      const result = await chrome.storage.local.get(['openai_api_key']);
      if (result.openai_api_key) {
        savedApiKey = result.openai_api_key;
        isApiKeySet = true;
      }
    } catch (error) {
      console.warn('Could not load saved API key:', error);
    }
  }

  // Save API key to Chrome storage
  async function saveApiKey(apiKey: string) {
    try {
      await chrome.storage.local.set({ openai_api_key: apiKey });
      savedApiKey = apiKey;
      isApiKeySet = true;
    } catch (error) {
      console.error('Could not save API key:', error);
    }
  }

  // Load API key when component mounts
  loadSavedApiKey();

  // On mount, auto-load cached summary and Q&A log for current video if available
  onMount(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      if (!videoId) return;
      const cachedKey = `summary_${videoId}`;
      const cached = await chrome.storage.local.get([cachedKey]);
      if (cached[cachedKey]) {
        summaryContent = marked.parse(cached[cachedKey]);
        showSummary = true;
        showTranscript = false;
        summaryLoading = false;
        progressMessage = 'Loaded from cache.';
      }
      // Load Q&A log
      const qaKey = `qa_${videoId}`;
      const qaCached = await chrome.storage.local.get([qaKey]);
      qaLog = qaCached[qaKey] || [];
    } catch (e) {
      // Ignore errors (e.g., not on a YouTube page)
    }
  });

  async function handleShowTranscript() {
    loading = true;
    error = '';
    showTranscript = false;
    showSummary = false;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      const transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');

      // Format transcript: insert line breaks at sentence boundaries
      function formatTranscript(text: string) {
        return text.replace(/([.!?])\s+/g, '$1\n');
      }
      transcriptContent = formatTranscript(transcript);
      showTranscript = true;
      showSummary = false;

      // Copy to clipboard in the popup (optional, on button click below)
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }

  function copyTranscript() {
    if (transcriptContent) {
      navigator.clipboard.writeText(transcriptContent).catch(() => {});
    }
  }

  function copySummary() {
    if (summaryContent) {
      // Copy plain text version
      const plain = new DOMParser().parseFromString(summaryContent, 'text/html').body.textContent || '';
      navigator.clipboard.writeText(plain).catch(() => {});
    }
  }

  async function handleGenerateSummary() {
    summaryLoading = true;
    summaryError = '';
    showSummary = false;
    showTranscript = false;
    transcriptContent = '';
    summaryContent = '';
    progress = 0;
    progressMessage = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      const transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');

      // Caching: Check for cached summary
      const cachedKey = `summary_${videoId}`;
      const cached = await chrome.storage.local.get([cachedKey]);
      if (cached[cachedKey]) {
        summaryContent = marked.parse(cached[cachedKey]);
        showSummary = true;
        summaryLoading = false;
        progressMessage = 'Loaded from cache.';
        return;
      }
      progressMessage = 'Generating new summary...';

      let apiKey = savedApiKey;
      if (!apiKey) {
        const newApiKey = prompt('Please enter your OpenAI API key:');
        if (!newApiKey) {
          summaryError = 'API key is required to generate summary.';
          return;
        }
        apiKey = newApiKey;
      }
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        summaryError = 'Invalid API key format. Please enter a valid OpenAI API key that starts with "sk-".';
        return;
      }
      if (apiKey !== savedApiKey) {
        await saveApiKey(apiKey);
      }
      openai.apiKey = apiKey.trim();
      const freshOpenAI = new OpenAI({
        apiKey: apiKey.trim(),
        dangerouslyAllowBrowser: true
      });
      function chunkTranscript(text: string, maxTokens: number = 8000) {
        const words = text.split(' ');
        const chunks = [];
        let currentChunk = '';
        for (const word of words) {
          if ((currentChunk + ' ' + word).length > maxTokens) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
        return chunks;
      }
      const transcriptChunks = chunkTranscript(transcript);
      let summary = '';
      if (transcriptChunks.length === 1) {
        const completion = await freshOpenAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a professional summarizer. Your job is to create clear, structured summaries of YouTube video transcripts using the Pareto Principle (80/20 rule). Focus on the 20% of the content that provides 80% of the value — core insights, arguments, facts, and takeaways. Use bullet points and headers. Include a TL;DR at the end. Your tone should be concise, neutral, and informative — no fluff."
            },
            {
              role: "user",
              content: `Summarize the following transcript using the 80/20 rule:\n\n1. Identify and list the most important insights, arguments, or concepts.\n2. Structure the summary with clear headers and bullet points.\n3. Use concise phrasing.\n4. Include a TL;DR at the end with a 1–2 sentence high-level takeaway.\n\nTranscript:\n${transcript}`
            }
          ],
          max_tokens: 800,
          temperature: 0.5,
        });
        summary = completion.choices[0]?.message?.content || '';
      } else {
        // Progress indicator and batching for multi-chunk
        progress = 0;
        const totalChunks = transcriptChunks.length;
        const batchSize = 5;
        let chunkSummaries: string[] = [];
        for (let batchStart = 0; batchStart < totalChunks; batchStart += batchSize) {
          const batch = transcriptChunks.slice(batchStart, batchStart + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (chunk, i) => {
              let attempts = 0;
              while (attempts < 3) {
                try {
                  const completion = await freshOpenAI.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                      {
                        role: "system",
                        content: "You are a summarization assistant. Your job is to extract key points and main ideas from short segments of a YouTube transcript. Be concise and clear."
                      },
                      {
                        role: "user",
                        content: `Summarize the following text segment. Focus on extracting the most important points in bullet form. Avoid filler.\n\nTranscript segment (part ${batchStart + i + 1} of ${totalChunks}):\n${chunk}`
                      }
                    ],
                    max_tokens: 800,
                    temperature: 0.5,
                  });
                  progress = Math.round(((batchStart + i + 1) / totalChunks) * 100);
                  return completion.choices[0]?.message?.content || '';
                } catch (error: any) {
                  if (error?.status === 429 || (error?.message && error.message.includes('rate limit'))) {
                    attempts++;
                    await new Promise(res => setTimeout(res, 1000 * attempts)); // Exponential backoff
                  } else {
                    return `[Error summarizing part ${batchStart + i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}]`;
                  }
                }
              }
              return `[Error summarizing part ${batchStart + i + 1}: Rate limit exceeded after 3 attempts]`;
            })
          );
          chunkSummaries = chunkSummaries.concat(batchResults);
        }
        const combinedSummaries = chunkSummaries.join('\n\n');
        const finalCompletion = await freshOpenAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a professional summarizer. Your job is to create clear, structured summaries of YouTube video transcripts using the Pareto Principle (80/20 rule). Focus on the 20% of the content that provides 80% of the value — core insights, arguments, facts, and takeaways. Use bullet points and headers. Include a TL;DR at the end. Your tone should be concise, neutral, and informative — no fluff."
            },
            {
              role: "user",
              content: `Summarize the following transcript using the 80/20 rule:\n\n1. Identify and list the most important insights, arguments, or concepts.\n2. Structure the summary with clear headers and bullet points.\n3. Use concise phrasing.\n4. Include a TL;DR at the end with a 1–2 sentence high-level takeaway.\n\nTranscript:\n${combinedSummaries}`
            }
          ],
          max_tokens: 800,
          temperature: 0.5,
        });
        summary = finalCompletion.choices[0]?.message?.content || '';
      }
      if (!summary) throw new Error('No summary generated');
      // Cache the new summary
      await chrome.storage.local.set({ [cachedKey]: summary });
      summaryContent = marked.parse(summary);
      showSummary = true;
      showTranscript = false;
      progress = 100;
      progressMessage = 'Summary generated.';
    } catch (err) {
      summaryError = err instanceof Error ? err.message : 'An error occurred';
      progressMessage = '';
    } finally {
      summaryLoading = false;
    }
  }

  async function handleRefreshSummary() {
    if (!videoId) return;
    const cachedKey = `summary_${videoId}`;
    await chrome.storage.local.remove([cachedKey]);
    await handleGenerateSummary();
  }

  function copyQueryResponse() {
    if (queryResponseContent) {
      const plain = new DOMParser().parseFromString(queryResponseContent, 'text/html').body.textContent || '';
      navigator.clipboard.writeText(plain).catch(() => {});
    }
  }

  async function handleAskQuestion() {
    queryLoading = true;
    queryError = '';
    showQueryResponse = false;
    queryResponseContent = '';
    try {
      // Reuse transcript fetching logic
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      const transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');

      // API key handling (reuse from summary)
      let apiKey = savedApiKey;
      if (!apiKey) {
        const newApiKey = prompt('Please enter your OpenAI API key:');
        if (!newApiKey) {
          queryError = 'API key is required.';
          return;
        }
        apiKey = newApiKey;
      }
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        queryError = 'Invalid API key format.';
        return;
      }
      if (apiKey !== savedApiKey) {
        await saveApiKey(apiKey);
      }
      openai.apiKey = apiKey.trim();
      const freshOpenAI = new OpenAI({
        apiKey: apiKey.trim(),
        dangerouslyAllowBrowser: true
      });

      if (!userQuery || userQuery.trim().length < 2) {
        queryError = 'Please enter a question.';
        return;
      }

      // Check for cached answer (case-insensitive match)
      const qaKey = `qa_${videoId}`;
      const qaCached = await chrome.storage.local.get([qaKey]);
      qaLog = qaCached[qaKey] || [];
      const cachedQA = qaLog.find(q => q.question.trim().toLowerCase() === userQuery.trim().toLowerCase());
      if (cachedQA) {
        queryResponseContent = marked.parse(cachedQA.answer);
        showQueryResponse = true;
        queryLoading = false;
        return;
      }

      // Reuse chunking function
      function chunkTranscript(text, maxTokens = 8000) {
        const words = text.split(' ');
        const chunks = [];
        let currentChunk = '';
        for (const word of words) {
          if ((currentChunk + ' ' + word).length > maxTokens) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
        return chunks;
      }
      const transcriptChunks = chunkTranscript(transcript);

      let answer = '';
      if (transcriptChunks.length === 1) {
        const completion = await freshOpenAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that answers questions accurately based only on the provided transcript. Be concise, neutral, and stick to the facts from the text. If the question can't be answered from the transcript, say so."
            },
            {
              role: "user",
              content: `Answer the following question based on this transcript:\nQuestion: ${userQuery}\n\nTranscript:\n${transcript}`
            }
          ],
          max_tokens: 800,
          temperature: 0.5,
        });
        answer = completion.choices[0]?.message?.content || '';
      } else {
        // Chunk handling: Summarize chunks first (reuse parallelization from optimizations)
        const chunkSummaries = await Promise.all(
          transcriptChunks.map(async (chunk, i) => {
            try {
              const completion = await freshOpenAI.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: "Extract key points from this transcript segment relevant to potential questions."
                  },
                  {
                    role: "user",
                    content: `Summarize key points in bullet form:\n${chunk}`
                  }
                ],
                max_tokens: 500,
                temperature: 0.5,
              });
              return completion.choices[0]?.message?.content || '';
            } catch (error) {
              return `[Error in part ${i + 1}]`;
            }
          })
        );
        const combinedSummaries = chunkSummaries.join('\n\n');

        // Final query on combined summaries
        const finalCompletion = await freshOpenAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that answers questions accurately based only on the provided summarized transcript. Be concise, neutral, and stick to the facts. If the question can't be answered, say so."
            },
            {
              role: "user",
              content: `Answer the following question based on this summarized transcript:\nQuestion: ${userQuery}\n\nSummarized Transcript:\n${combinedSummaries}`
            }
          ],
          max_tokens: 800,
          temperature: 0.5,
        });
        answer = finalCompletion.choices[0]?.message?.content || '';
      }

      if (!answer) throw new Error('No answer generated');
      queryResponseContent = marked.parse(answer);
      showQueryResponse = true;
      // Save to Q&A log
      const newQA = { question: userQuery.trim(), answer, timestamp: Date.now() };
      qaLog = [...qaLog, newQA];
      await chrome.storage.local.set({ [qaKey]: qaLog });
    } catch (err) {
      queryError = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      queryLoading = false;
    }
  }
</script>

<main class="p-4 w-[500px]">
  <h1 class="text-lg font-bold mb-2">TLDW</h1>
  <button
    on:click={handleShowTranscript}
    disabled={loading}
    class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded flex items-center w-full mb-3"
  >
    {#if loading}
      <svg class="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
      Loading transcript...
    {:else}
      Show Full Transcript
    {/if}
  </button>
  <button
    on:click={handleGenerateSummary}
    disabled={summaryLoading}
    class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded flex items-center w-full mb-3"
  >
    {#if summaryLoading}
      <svg class="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
      Generating summary...
    {:else}
      Generate AI Summary
    {/if}
  </button>
  <button
    on:click={async () => {
      const newApiKey = prompt('Enter your OpenAI API key:');
      if (newApiKey && newApiKey.startsWith('sk-') && newApiKey.length >= 20) {
        await saveApiKey(newApiKey);
      } else if (newApiKey) {
        error = 'Invalid API key format. Must start with "sk-" and be at least 20 characters.';
      }
    }}
    class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded flex items-center w-full mt-2 text-sm"
  >
    {#if isApiKeySet}
      🔑 API Key Set (${savedApiKey.substring(0, 8)}...)
    {:else}
      🔑 Set API Key
    {/if}
  </button>

  {#if showTranscript}
    <div class="mt-4">
      <h2 class="text-md font-semibold mb-2">Full Transcript</h2>
      <pre class="bg-gray-100 rounded p-2 text-sm overflow-x-auto whitespace-pre-wrap w-full">{transcriptContent}</pre>
      <button on:click={copyTranscript} class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded mt-2 text-xs">Copy Transcript</button>
    </div>
  {/if}

  {#if showSummary}
    <div class="mt-4">
      <h2 class="text-md font-semibold mb-2">AI Summary</h2>
      <div class="bg-gray-100 rounded p-2 text-sm overflow-x-auto summary-html w-full">{@html summaryContent}</div>
      <button on:click={copySummary} class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded mt-2 text-xs">Copy Summary</button>
      <button on:click={handleRefreshSummary} class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded mt-2 text-xs ml-2">Refresh Summary</button>
    </div>
    <!-- Ask Question UI and Answer Display -->
    <div class="mt-4">
      <input
        type="text"
        placeholder="Ask a question about the transcript..."
        bind:value={userQuery}
        class="w-full p-2 border rounded mb-2"
        on:keydown={(e) => { if (e.key === 'Enter') handleAskQuestion(); }}
        disabled={queryLoading}
      />
      <button
        on:click={handleAskQuestion}
        disabled={queryLoading}
        class="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded flex items-center w-full mb-3"
      >
        {#if queryLoading}
          <svg class="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
          Answering question...
        {:else}
          Ask Question about Transcript
        {/if}
      </button>
      {#if showQueryResponse}
        <div class="mt-4">
          <h2 class="text-md font-semibold mb-2">Answer to: {userQuery}</h2>
          <div class="bg-gray-100 rounded p-2 text-sm overflow-x-auto summary-html">{@html queryResponseContent}</div>
          <button on:click={copyQueryResponse} class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded mt-2 text-xs">Copy Answer</button>
        </div>
      {/if}
      {#if queryError}
        <p class="text-red-600 text-sm mt-2">{queryError}</p>
      {/if}
      {#if qaLog.length > 0}
        <div class="mt-4">
          <h2 class="text-md font-semibold mb-2">Previous Questions & Answers</h2>
          <ul class="space-y-2">
            {#each qaLog as qa}
              <li class="bg-gray-50 rounded p-2 text-xs">
                <div class="font-semibold text-gray-700 mb-1">
                  Q: {qa.question}
                  {#if qa.timestamp}
                    <span class="text-gray-400 ml-2">({new Date(qa.timestamp).toLocaleString()})</span>
                  {/if}
                </div>
                <div class="summary-html">{@html marked.parse(qa.answer)}</div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
  {#if summaryLoading || progressMessage}
    <div class="mt-2">
      {#if progressMessage}
        <p class="text-gray-700 text-xs">{progressMessage}</p>
      {/if}
      {#if summaryLoading && progress > 0 && progress < 100}
        <div class="w-full bg-gray-200 rounded h-2 mt-1">
          <div class="bg-blue-500 h-2 rounded" style="width: {progress}%"></div>
        </div>
        <p class="text-xs text-gray-500 mt-1">{progress}% complete</p>
      {/if}
    </div>
  {/if}
  {#if error}
    <p class="text-red-600 text-sm mt-2">{error}</p>
  {/if}
  {#if summaryError}
    <p class="text-red-600 text-sm mt-2">{summaryError}</p>
  {/if}
</main>

<style>
.summary-html :global(h1),
.summary-html :global(h2),
.summary-html :global(h3),
.summary-html :global(h4),
.summary-html :global(h5),
.summary-html :global(h6) {
  color: #1f2937;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
}
.summary-html :global(ul),
.summary-html :global(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.summary-html :global(li) {
  margin: 0.3em 0;
}
.summary-html :global(strong),
.summary-html :global(b) {
  font-weight: 600;
  color: #1f2937;
}
.summary-html :global(em),
.summary-html :global(i) {
  font-style: italic;
}
.summary-html :global(code) {
  background: #e5e7eb;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: monospace;
}
.summary-html :global(blockquote) {
  border-left: 4px solid #3b82f6;
  margin: 1em 0;
  padding-left: 1em;
  color: #6b7280;
}
</style>

