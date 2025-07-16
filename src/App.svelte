<script lang="ts">
  import OpenAI from 'openai';
  import { marked } from 'marked';
  import { createTranscriptHtml } from './lib/htmlTemplates';
  import { onMount, tick } from 'svelte';
  let topBarRef: HTMLDivElement;
  let footerBarRef: HTMLDivElement;
  $: if (topBarRef && footerBarRef && outputRef) {
    outputRef.style.position = 'absolute';
    outputRef.style.top = `${topBarRef.offsetHeight}px`;
    outputRef.style.bottom = `${footerBarRef.offsetHeight}px`;
    outputRef.style.left = '0';
    outputRef.style.right = '0';
    outputRef.style.overflowY = 'auto';
    outputRef.style.overflowX = 'hidden';
    outputRef.style.height = '';
    outputRef.style.paddingTop = '';
    outputRef.style.paddingBottom = '';
  }

  let loading = false;
  let error = '';
  let summaryLoading = false;
  let summaryError = '';
  let savedApiKey = '';
  let isApiKeySet = false;

  let videoId = '';
  let progress = 0;
  let progressMessage = '';

  let queryLoading = false;
  let queryError = '';
  let userQuery = '';
  let qaLog = [];

  // --- DOS Console Log State ---
  type ConsoleEntry = { timestamp: string, type: string, content: string };
  let consoleLog: ConsoleEntry[] = [];
  let outputRef: HTMLDivElement;

  function appendToLog(type: string, content: string) {
    const timestamp = new Date().toLocaleString();
    consoleLog = [...consoleLog, { timestamp, type, content }];
  }

  $: if (consoleLog.length && outputRef) {
    outputRef.scrollTop = outputRef.scrollHeight;
  }

  let transcriptFetched = false;
  function scrollToTranscript() {
    if (outputRef) {
      const entries = outputRef.querySelectorAll('.console-entry.transcript');
      if (entries.length > 0) {
        (entries[0] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function scrollToLatestQA() {
    if (outputRef) {
      const entries = outputRef.querySelectorAll('.console-entry.qa');
      if (entries.length > 0) {
        (entries[entries.length - 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  let summaryFetched = false;
  function scrollToSummary() {
    if (outputRef) {
      const entries = outputRef.querySelectorAll('.console-entry.summary');
      if (entries.length > 0) {
        (entries[0] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  let helpShown = false;
  function scrollToHelp() {
    if (outputRef) {
      const entries = outputRef.querySelectorAll('.console-entry.help');
      if (entries.length > 0) {
        (entries[0] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  let lastTranscriptContent = '';
  let lastSummaryContent = '';
  let lastQAContent = '';

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    appendToLog('system', 'Copied to clipboard!');
  }

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: '', // This will be set by the user
    dangerouslyAllowBrowser: true
  });

  async function loadSavedApiKey() {
    try {
      const result = await chrome.storage.local.get(['openai_api_key']);
      if (result.openai_api_key) {
        savedApiKey = result.openai_api_key;
        isApiKeySet = true;
      }
    } catch (error) {
      appendToLog('system', 'Could not load saved API key.');
    }
  }

  async function saveApiKey(apiKey: string) {
    try {
      await chrome.storage.local.set({ openai_api_key: apiKey });
      savedApiKey = apiKey;
      isApiKeySet = true;
      appendToLog('system', 'API key saved.');
    } catch (error) {
      appendToLog('error', 'Could not save API key.');
    }
  }

  loadSavedApiKey();

  onMount(async () => {
    await tick();
    if (topBarRef && footerBarRef && outputRef) {
      outputRef.style.position = 'absolute';
      outputRef.style.top = `${topBarRef.offsetHeight}px`;
      outputRef.style.bottom = `${footerBarRef.offsetHeight}px`;
      outputRef.style.left = '0';
      outputRef.style.right = '0';
      outputRef.style.overflowY = 'auto';
      outputRef.style.overflowX = 'hidden';
      outputRef.style.height = '';
      outputRef.style.paddingTop = '';
      outputRef.style.paddingBottom = '';
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      if (!videoId) return;
      // Load cached summary
      const cachedKey = `summary_${videoId}`;
      const cached = await chrome.storage.local.get([cachedKey]);
      if (cached[cachedKey]) {
        lastSummaryContent = cached[cachedKey];
        appendToLog('summary', marked.parse(cached[cachedKey]));
      }
      // Load Q&A log
      const qaKey = `qa_${videoId}`;
      const qaCached = await chrome.storage.local.get([qaKey]);
      qaLog = qaCached[qaKey] || [];
      if (qaLog.length > 0) {
        qaLog.forEach(qa => {
          appendToLog('qa', `<b>Q:</b> ${qa.question}<br/><b>A:</b> ${marked.parse(qa.answer)}`);
        });
      }
    } catch (e) {
      // Ignore errors (e.g., not on a YouTube page)
    }
  });

  async function handleShowTranscript() {
    showQASection = false;
    qaSectionMessage = '';
    if (transcriptFetched) {
      scrollToTranscript();
      return;
    }
    loading = true;
    error = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      const transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');
      function formatTranscript(text: string) {
        return text.replace(/([.!?])\s+/g, '$1\n');
      }
      const transcriptContent = formatTranscript(transcript);
      lastTranscriptContent = transcriptContent;
      appendToLog('transcript', marked.parse(transcriptContent));
      transcriptFetched = true;
    } catch (err) {
      appendToLog('error', err instanceof Error ? err.message : 'An error occurred');
    } finally {
      loading = false;
    }
  }

  async function handleGenerateSummary() {
    showQASection = false;
    qaSectionMessage = '';
    if (summaryFetched) {
      scrollToSummary();
      return;
    }
    summaryLoading = true;
    summaryError = '';
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
        lastSummaryContent = cached[cachedKey];
        appendToLog('summary', marked.parse(cached[cachedKey]));
        summaryFetched = true;
        return;
      }
      progressMessage = 'Generating new summary...';
      let apiKey = savedApiKey;
      if (!apiKey) {
        const newApiKey = prompt('Please enter your OpenAI API key:');
        if (!newApiKey) {
          appendToLog('error', 'API key is required to generate summary.');
          return;
        }
        apiKey = newApiKey;
      }
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        appendToLog('error', 'Invalid API key format. Please enter a valid OpenAI API key that starts with "sk-".');
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
      await chrome.storage.local.set({ [cachedKey]: summary });
      lastSummaryContent = summary;
      appendToLog('summary', marked.parse(summary));
      summaryFetched = true;
      progress = 100;
      progressMessage = 'Summary generated.';
    } catch (err) {
      appendToLog('error', err instanceof Error ? err.message : 'An error occurred');
      progressMessage = '';
    } finally {
      summaryLoading = false;
    }
  }

  async function handleAskQuestion() {
    queryLoading = true;
    queryError = '';
    progress = 0;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      const transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');
      let apiKey = savedApiKey;
      if (!apiKey) {
        const newApiKey = prompt('Please enter your OpenAI API key:');
        if (!newApiKey) {
          appendToLog('error', 'API key is required.');
          return;
        }
        apiKey = newApiKey;
      }
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        appendToLog('error', 'Invalid API key format.');
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
        appendToLog('error', 'Please enter a question.');
        return;
      }
      const qaKey = `qa_${videoId}`;
      const qaCached = await chrome.storage.local.get([qaKey]);
      qaLog = qaCached[qaKey] || [];
      const cachedQA = qaLog.find(q => q.question.trim().toLowerCase() === userQuery.trim().toLowerCase());
      if (cachedQA) {
        lastQAContent = cachedQA.answer;
        appendToLog('qa', `<b>Q:</b> ${userQuery}<br/><b>A:</b> ${marked.parse(cachedQA.answer)}`);
        await tick();
        scrollToLatestQA();
        return;
      }
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
        progress = 50;
        const completion = await freshOpenAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant that answers questions based on the provided transcript. If the transcript directly answers the question, provide a concise, factual answer. If the transcript does not directly answer the question, first state that the transcript does not explicitly cover the question. Then, based on the principles, themes, or content of the transcript, provide a likely or inferred answer, making it clear that this is an inference.`
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
        progress = 100;
      } else {
        // Chunk handling: Summarize chunks first (reuse parallelization from optimizations)
        progress = 10;
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
              progress = Math.round(10 + ((i + 1) / transcriptChunks.length) * 60);
              return completion.choices[0]?.message?.content || '';
            } catch (error) {
              return `[Error in part ${i + 1}]`;
            }
          })
        );
        const combinedSummaries = chunkSummaries.join('\n\n');
        progress = 80;
        const finalCompletion = await freshOpenAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant that answers questions based on the provided summarized transcript. If the summarized transcript directly answers the question, provide a concise, factual answer. If the summarized transcript does not directly answer the question, first state that the transcript does not explicitly cover the question. Then, based on the principles, themes, or content of the transcript, provide a likely or inferred answer, making it clear that this is an inference.`
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
        progress = 100;
      }
      if (!answer) throw new Error('No answer generated');
      lastQAContent = answer;
      appendToLog('qa', `<b>Q:</b> ${userQuery}<br/><b>A:</b> ${marked.parse(answer)}`);
      await tick();
      scrollToLatestQA();
      // Save to Q&A log
      const newQA = { question: userQuery.trim(), answer, timestamp: Date.now() };
      qaLog = [...qaLog, newQA];
      await chrome.storage.local.set({ [qaKey]: qaLog });
      // Clear the QA section message if a question has been asked
      if (showQASection && qaLog.length > 0) {
        qaSectionMessage = '';
      }
    } catch (err) {
      appendToLog('error', err instanceof Error ? err.message : 'An error occurred');
    } finally {
      queryLoading = false;
      progress = 0;
    }
  }

  async function handleRefresh() {
    showQASection = false;
    qaSectionMessage = '';
    if (!videoId) return;
    const summaryKey = `summary_${videoId}`;
    const qaKey = `qa_${videoId}`;
    // Remove from Chrome storage
    await chrome.storage.local.remove([summaryKey, qaKey]);
    // Remove summary and Q/A entries from log
    consoleLog = consoleLog.filter(e => e.type !== 'summary' && e.type !== 'qa');
    summaryFetched = false;
    showQASection = false;
    // Optionally reset Q/A log
    qaLog = [];
    // Generate new summary
    handleGenerateSummary();
  }

  function handleHelp() {
    showQASection = false;
    qaSectionMessage = '';
    if (helpShown) {
      scrollToHelp();
      return;
    }
    appendToLog('help', `Commands: <b>transcript</b>, <b>summary</b>, <b>ask</b>, <b>key</b>, <b>help/contact</b><br/>- transcript: Show full transcript<br/>- summary: Generate AI summary<br/>- ask: Ask a question about the transcript<br/>- key: Set OpenAI API key<br/>- help/contact: Open help and contact form<br/><a href='https://forms.gle/EFEdwasbURJjuGew6' target='_blank' rel='noopener noreferrer' class='google-form-link'>Open Feedback & Contact Form</a>`);
    helpShown = true;
  }

  let showApiKeyModal = false;
  let apiKeyInput = '';
  let apiKeyError = '';
  function handleKey() {
    showQASection = false;
    qaSectionMessage = '';
    apiKeyInput = savedApiKey || '';
    apiKeyError = '';
    showApiKeyModal = true;
  }

  async function saveApiKeyFromModal() {
    if (!apiKeyInput.startsWith('sk-') || apiKeyInput.length < 20) {
      apiKeyError = 'Invalid API key format. Must start with "sk-" and be at least 20 characters.';
      return;
    }
    await saveApiKey(apiKeyInput);
    showApiKeyModal = false;
  }
  function cancelApiKeyModal() {
    showApiKeyModal = false;
    apiKeyError = '';
  }

  let qaSectionMessage = '';
  let showQASection = false;
  function handleQASection() {
    const qaCount = consoleLog.filter(e => e.type === 'qa').length;
    showQASection = true;
    qaSectionMessage = qaCount === 0 ? 'No questions have been asked yet.' : '';
    // Scroll to first Q/A entry
    setTimeout(() => {
      if (outputRef) {
        const entries = outputRef.querySelectorAll('.console-entry.qa');
        if (entries.length > 0) {
          (entries[0] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 0);
  }
  function exitQASection() {
    showQASection = false;
    qaSectionMessage = '';
  }
</script>

<main class="dos-main">
  <!-- Top Bar (Fixed) -->
  <div class="top-bar" bind:this={topBarRef}>
    <div class="prompt-line">
      <span class="prompt">C:\TLDW&gt;</span>
      <button on:click={handleGenerateSummary} disabled={summaryLoading}>summary</button>
      <button on:click={handleRefresh} disabled={summaryLoading} title="Refresh summary and Q/A">refresh</button>
      <button on:click={handleQASection}>Q/A</button>
      <button on:click={handleShowTranscript} disabled={loading}><span style="white-space: pre-line;">full<br/>transcript</span></button>
      <button on:click={handleKey}>key</button>
      <button on:click={handleHelp}><span style="white-space: pre-line;">help<br/>contact</span></button>
    </div>
    <div class="input-area">
      <input
        type="text"
        placeholder="Type your question and press Enter..."
        bind:value={userQuery}
        on:keydown={(e) => { if (e.key === 'Enter') handleAskQuestion(); }}
        disabled={queryLoading}
      />
      <button on:click={handleAskQuestion} disabled={queryLoading || !userQuery.trim()}>ask</button>
    </div>
  </div>
  {#if showApiKeyModal}
    <div class="modal-overlay">
      <div class="api-key-modal">
        <div class="api-key-modal-header">
          <span>Enter your OpenAI API key</span>
          <button class="close-btn" on:click={cancelApiKeyModal}>&times;</button>
        </div>
        <textarea
          bind:value={apiKeyInput}
          placeholder="sk-..."
          rows="3"
          spellcheck="false"
          class="api-key-textarea"
        ></textarea>
        {#if apiKeyError}
          <div class="api-key-error">{apiKeyError}</div>
        {/if}
        <div class="api-key-modal-actions">
          <button on:click={saveApiKeyFromModal}>Save</button>
          <button on:click={cancelApiKeyModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
  <!-- Console Output (Scrollable Middle) -->
  <div class="console-output" bind:this={outputRef}>
    {#if showQASection}
      <div class="qa-header">
        <span>Q/A Section</span>
        <button class="exit-qa-btn" on:click={exitQASection}>Exit Q/A</button>
      </div>
      {#each consoleLog as entry, i}
        {#if entry.type === 'qa'}
          <pre class="console-entry qa">----- [{entry.timestamp}] Q/A -----
{@html entry.content}
{#if i === consoleLog.findLastIndex(e => e.type === 'qa') && lastQAContent}
  <button class="copy-btn" on:click={() => copyToClipboard(lastQAContent)}>Copy Answer</button>
{/if}
</pre>
        {/if}
      {/each}
      {#if qaSectionMessage}
        <div class="qa-section-message">{qaSectionMessage}</div>
      {/if}
    {:else}
      {#each consoleLog as entry, i}
        {#if entry.type === 'help'}
          <div class="console-entry help help-block">
            <div>{@html entry.content}</div>
          </div>
        {:else}
          <pre class="console-entry {entry.type}">----- [{entry.timestamp}] {entry.type.toUpperCase()} -----
{@html entry.content}
{#if entry.type === 'transcript' && i === consoleLog.findLastIndex(e => e.type === 'transcript') && lastTranscriptContent}
  <button class="copy-btn" on:click={() => copyToClipboard(lastTranscriptContent)}>Copy Transcript</button>
{:else if entry.type === 'summary' && i === consoleLog.findLastIndex(e => e.type === 'summary') && lastSummaryContent}
  <button class="copy-btn" on:click={() => copyToClipboard(lastSummaryContent)}>Copy Summary</button>
{:else if entry.type === 'qa' && i === consoleLog.findLastIndex(e => e.type === 'qa') && lastQAContent}
  <button class="copy-btn" on:click={() => copyToClipboard(lastQAContent)}>Copy Answer</button>
{/if}
</pre>
        {/if}
      {/each}
      {#if qaSectionMessage}
        <div class="qa-section-message">{qaSectionMessage}</div>
      {/if}
      {#if loading || summaryLoading || queryLoading}
        <span class="loading-cursor">Processing</span>
      {/if}
    {/if}
  </div>
  <!-- Footer Bar (Fixed) -->
  <div class="footer-bar" bind:this={footerBarRef}>
    <span>API Key: {isApiKeySet ? 'SET' : 'NOT SET'} | v1.0 | TLDW DOS UI</span>
    {#if queryLoading}
      <span class="progress-bar-area">
        <span class="progress-label">Processing...</span>
        <span class="progress-percent">{progress}%</span>
        <div class="progress-bar">
          <div class="progress-bar-inner" style="width: {progress}%;"></div>
        </div>
      </span>
    {/if}
    {#if loading || summaryLoading}
      <span class="progress-bar-area">
        <span class="progress-label">Processing...</span>
      </span>
    {/if}
  </div>
</main>

<style>
@import url('https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500;700&display=swap');
:global(body) {
  background-color: #000;
  color: #00FF00;
  font-family: 'Fira Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 15px;
  margin: 0;
  padding: 0;
  height: auto;
  min-height: auto;
  overflow: hidden;
  text-shadow: 0 0 5px #00FF00, 0 0 10px #00FF00;
  position: relative;
}
.dos-main {
  width: 625px;
  height: 600px;
  min-height: unset;
  display: block;
  box-sizing: border-box;
  border: 2px solid #00FF00;
  box-shadow: 0 0 20px #00FF0044;
  margin: 0 auto;
  position: relative;
  background: #000;
  overflow: hidden;
}
.prompt-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 10px 0 10px;
  font-size: 1.1em;
  border-bottom: 1px solid #00FF00;
  background: #000;
  z-index: 2;
  flex: 0 0 auto;
}
.prompt {
  margin-right: 10px;
  font-weight: bold;
}
button {
  background: none;
  border: none;
  color: #00FF00;
  font-family: inherit;
  font-size: 1em;
  cursor: pointer;
  text-decoration: underline;
  margin-right: 10px;
  padding: 2px 6px;
  transition: text-shadow 0.2s;
}
button:hover {
  text-shadow: 0 0 10px #00FF00, 0 0 20px #00FF00;
}
button:disabled {
  color: #008000;
  text-decoration: none;
  cursor: not-allowed;
}
.input-area {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: #000;
  border-bottom: 1px solid #00FF00;
  z-index: 2;
  flex: 0 0 auto;
}
.input-area input {
  background: #000;
  border: 1px solid #00FF00;
  color: #00FF00;
  font-family: inherit;
  font-size: 1em;
  padding: 4px 8px;
  flex: 1;
  margin-right: 8px;
  outline: none;
  box-shadow: 0 0 4px #00FF0044;
}
.console-output {
  background: #000;
  border: none;
  position: absolute;
  z-index: 1;
  max-width: 100%;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 10px;
  /* top, bottom, left, right, overflow-y, overflow-x set dynamically by script */
}
.console-entry {
  margin-bottom: 12px;
  color: #00FF00;
  text-shadow: 0 0 5px #00FF00, 0 0 10px #00FF00;
  word-break: break-word;
  white-space: pre-wrap;
  max-width: 100%;
}
.console-entry.error {
  color: #FF00FF;
  text-shadow: 0 0 8px #FF00FF;
}
.console-entry.help {
  color: #00FFFF;
  text-shadow: 0 0 8px #00FFFF;
}
.copy-btn {
  color: #00FF00;
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
  margin-left: 10px;
  font-size: 0.9em;
}
.copy-btn:hover {
  text-shadow: 0 0 10px #00FF00;
}
.loading-cursor::after {
  content: '_';
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}
.footer-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 20;
  background: #000;
  border-top: 1px solid #00FF00;
  color: #00FF00;
  font-size: 0.95em;
  padding: 4px 10px;
  text-align: left;
  letter-spacing: 1px;
  min-height: 24px;
  /* min-height: 24px; */
}
/* Scanlines effect */
.dos-main::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 600px;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 1px,
    rgba(0, 0, 0, 0.5) 1px,
    rgba(0, 0, 0, 0.5) 2px
  );
  pointer-events: none;
  opacity: 0.25;
  z-index: 10;
}
/* Make summary and Q/A text white for readability, no glow */
.console-entry.summary,
.console-entry.qa {
  color: #FFF;
  text-shadow: none;
}
.console-entry.transcript {
  color: #FFF;
  text-shadow: none;
}
.qa-section-message {
  color: #FFF;
  background: #111;
  padding: 8px 12px;
  border: 1px solid #FFF;
  border-radius: 4px;
  margin: 10px 0;
  text-align: center;
  font-size: 1.1em;
  box-shadow: 0 0 4px #FFF2;
}
.qa-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.2em;
  color: #FFF;
  border-bottom: 1px solid #FFF;
  margin-bottom: 10px;
  padding-bottom: 4px;
}
.exit-qa-btn {
  color: #FFF;
  background: #222;
  border: 1px solid #FFF;
  border-radius: 3px;
  padding: 2px 10px;
  font-size: 1em;
  cursor: pointer;
  margin-left: 10px;
  text-decoration: none;
}
.exit-qa-btn:hover {
  background: #444;
  color: #00FF00;
}
.progress-bar-area {
  display: inline-block;
  margin-left: 20px;
  vertical-align: middle;
}
.progress-label {
  color: #FFF;
  margin-right: 8px;
  font-size: 0.95em;
}
.progress-percent {
  color: #FFF;
  margin-right: 8px;
  font-size: 0.95em;
}
.progress-bar {
  display: inline-block;
  width: 80px;
  height: 8px;
  background: #222;
  border: 1px solid #FFF;
  border-radius: 4px;
  overflow: hidden;
  vertical-align: middle;
}
.progress-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, #00FF00 0%, #FFF 100%);
  width: 0%;
  transition: width 0.2s;
}
.contact-form-modal {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: #111;
  border: 2px solid #00FF00;
  border-radius: 8px;
  box-shadow: 0 0 20px #00FF0044;
  padding: 20px 24px 16px 24px;
  z-index: 100;
  width: 350px;
  max-width: 95vw;
}
.contact-form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.2em;
  color: #00FF00;
  margin-bottom: 10px;
}
.close-btn {
  background: none;
  border: none;
  color: #00FF00;
  font-size: 1.3em;
  cursor: pointer;
  margin-left: 10px;
  text-decoration: none;
}
.close-btn:hover {
  color: #FFF;
}
.contact-form-modal input,
.contact-form-modal textarea {
  width: 100%;
  margin-bottom: 10px;
  padding: 6px 8px;
  border: 1px solid #00FF00;
  border-radius: 3px;
  background: #000;
  color: #00FF00;
  font-family: inherit;
  font-size: 1em;
  box-shadow: 0 0 4px #00FF0044;
}
.contact-form-modal textarea {
  min-height: 60px;
  resize: vertical;
}
.contact-form-modal button[type="submit"] {
  background: #00FF00;
  color: #000;
  border: none;
  border-radius: 3px;
  padding: 6px 18px;
  font-size: 1em;
  font-family: inherit;
  cursor: pointer;
  font-weight: bold;
  margin-top: 4px;
}
.contact-form-modal button[type="submit"]:hover {
  background: #FFF;
  color: #00FF00;
}
.contact-form-confirmation {
  background: #111;
  color: #00FF00;
  border: 1px solid #00FF00;
  border-radius: 4px;
  padding: 12px 16px;
  margin: 18px auto;
  text-align: center;
  font-size: 1.1em;
  width: 350px;
  max-width: 95vw;
  box-shadow: 0 0 8px #00FF0044;
}
.help-block {
  background: #001a1a;
  border: 1px solid #00FFFF;
  border-radius: 6px;
  padding: 14px 18px 14px 18px;
  margin-bottom: 16px;
  color: #00FFFF;
  box-shadow: 0 0 8px #00FFFF44;
  position: relative;
  font-size: 1.05em;
}
.contact-btn {
  display: block;
  margin: 16px auto 0 auto;
  background: #00FFFF;
  color: #000;
  border: none;
  border-radius: 4px;
  padding: 7px 22px;
  font-size: 1.1em;
  font-family: inherit;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 0 6px #00FFFF44;
  transition: background 0.2s, color 0.2s;
}
.contact-btn:hover {
  background: #FFF;
  color: #00FFFF;
}
.contact-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.55);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.contact-form-centered {
  position: relative;
  top: unset;
  left: unset;
  transform: none;
  margin: 0 auto;
  box-shadow: 0 0 24px #00FF0044, 0 0 0 100vmax rgba(0,0,0,0.2);
}
.contact-error {
  color: #FF00FF;
  background: #111;
  border: 1px solid #FF00FF;
  border-radius: 4px;
  padding: 10px 14px;
  margin-top: 12px;
  text-align: center;
  font-size: 1em;
}
.google-form-link {
  color: #00FFFF;
  text-decoration: underline;
  font-weight: bold;
  display: inline-block;
  margin-top: 10px;
  font-size: 1.1em;
}
.google-form-link:hover {
  color: #FFF;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.7);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.api-key-modal {
  background: #111;
  border: 2px solid #00FF00;
  border-radius: 8px;
  box-shadow: 0 0 20px #00FF0044;
  padding: 24px 28px 18px 28px;
  z-index: 10000;
  width: 420px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.api-key-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.1em;
  color: #00FF00;
  margin-bottom: 10px;
}
.api-key-textarea {
  width: 100%;
  min-height: 48px;
  resize: vertical;
  border: 1px solid #00FF00;
  border-radius: 3px;
  background: #000;
  color: #00FF00;
  font-family: inherit;
  font-size: 1em;
  box-shadow: 0 0 4px #00FF0044;
  margin-bottom: 10px;
  padding: 6px 8px;
}
.api-key-error {
  color: #FF00FF;
  background: #111;
  border: 1px solid #FF00FF;
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 10px;
  text-align: center;
  font-size: 1em;
}
.api-key-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

