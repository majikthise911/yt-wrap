<script lang="ts">
  import OpenAI from 'openai';
  import { marked } from 'marked';
  import { createTranscriptHtml, createSummaryHtml } from './lib/htmlTemplates';

  let loading = false;
  let error = '';
  let summaryLoading = false;
  let summaryError = '';
  let savedApiKey = '';
  let isApiKeySet = false;

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
      try {
        await navigator.clipboard.writeText(formattedTranscript);
      } catch (clipboardError) {
        console.warn('Clipboard API failed for transcript, using fallback method:', clipboardError);
        // Fallback: create a temporary textarea and copy from it
        const textArea = document.createElement('textarea');
        textArea.value = formattedTranscript;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (fallbackError) {
          console.error('Fallback clipboard method also failed:', fallbackError);
        }
        document.body.removeChild(textArea);
      }

      // Open a new tab and display the transcript
      const transcriptHtml = createTranscriptHtml(videoId, formattedTranscript);
      const blob = new Blob([transcriptHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }

  // Function to create a basic summary without API
  function createBasicSummary(transcript: string) {
    // Split into sentences
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Take first few sentences and last few sentences
    const firstSentences = sentences.slice(0, 3);
    const lastSentences = sentences.slice(-3);
    
    // Combine and clean up
    const summary = [...firstSentences, ...lastSentences]
      .filter((s, i, arr) => arr.indexOf(s) === i) // Remove duplicates
      .join('. ') + '.';
    
    return `Basic Summary (without AI):
    
${summary}

Note: This is a basic summary using the first and last parts of the transcript. For a more comprehensive AI-powered summary, please check your OpenAI API quota and try again.`;
  }

  async function handleGenerateSummary() {
    summaryLoading = true;
    summaryError = '';

    let transcript = '';
    let videoId = '';

    try {
      // Get transcript first
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab found');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_ID' });
      videoId = response.videoId;
      transcript = response.transcript;
      if (!videoId) throw new Error('No video ID found. Make sure you are on a YouTube video page.');
      if (!transcript) throw new Error('No transcript found. This video might not have captions available, or you may need to open the transcript panel first.');

      // Get API key from user or use saved key
      let apiKey = savedApiKey;
      
      if (!apiKey) {
        const newApiKey = prompt('Please enter your OpenAI API key:');
        if (!newApiKey) {
          summaryError = 'API key is required to generate summary.';
          return;
        }
        apiKey = newApiKey;
      } else {
        // Ask if user wants to use saved key or enter a new one
        const useSavedKey = confirm(`Use saved API key? (${apiKey.substring(0, 8)}...)\n\nClick OK to use saved key, or Cancel to enter a new one.`);
        if (!useSavedKey) {
          const newApiKey = prompt('Please enter your new OpenAI API key:');
          if (!newApiKey) {
            summaryError = 'API key is required to generate summary.';
            return;
          }
          apiKey = newApiKey;
        }
      }

      // Validate API key format
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        summaryError = 'Invalid API key format. Please enter a valid OpenAI API key that starts with "sk-".';
        return;
      }

      // Save the API key if it's new or different
      if (apiKey !== savedApiKey) {
        await saveApiKey(apiKey);
      }

      // Update OpenAI client with user's API key
      openai.apiKey = apiKey.trim();

      // Create a fresh OpenAI client instance to avoid header conflicts
      const freshOpenAI = new OpenAI({
        apiKey: apiKey.trim(),
        dangerouslyAllowBrowser: true
      });

      // Function to chunk transcript if it's too long
      function chunkTranscript(text: string, maxTokens: number = 3000) {
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

      // Chunk the transcript if it's too long
      const transcriptChunks = chunkTranscript(transcript);
      let summary = '';

      if (transcriptChunks.length === 1) {
        // Single chunk - use normal approach
        const completion = await freshOpenAI.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a professional summarizer. Your job is to create clear, structured summaries of YouTube video transcripts using the Pareto Principle (80/20 rule). Focus on the 20% of the content that provides 80% of the value — core insights, arguments, facts, and takeaways. Use bullet points and headers. Include a TL;DR at the end. Your tone should be concise, neutral, and informative — no fluff."
            },
            {
              role: "user",
              content: `Summarize the following transcript using the 80/20 rule:

1. Identify and list the most important insights, arguments, or concepts.
2. Structure the summary with clear headers and bullet points.
3. Use concise phrasing.
4. Include a TL;DR at the end with a 1–2 sentence high-level takeaway.

Transcript:
${transcript}`
            }
          ],
          max_tokens: 1000,
          temperature: 0.7,
        });

        summary = completion.choices[0]?.message?.content || '';
      } else {
        // Multiple chunks - summarize each chunk, then summarize the summaries
        const chunkSummaries = [];
        
        for (let i = 0; i < transcriptChunks.length; i++) {
          try {
            const completion = await freshOpenAI.chat.completions.create({
              model: "gpt-3.5-turbo",
              messages: [
                {
                  role: "system",
                  content: "You are a summarization assistant. Your job is to extract key points and main ideas from short segments of a YouTube transcript. Be concise and clear."
                },
                {
                  role: "user",
                  content: `Summarize the following text segment. Focus on extracting the most important points in bullet form. Avoid filler.

Transcript segment (part ${i + 1} of ${transcriptChunks.length}):
${transcriptChunks[i]}`
                }
              ],
              max_tokens: 500,
              temperature: 0.7,
            });

            const chunkSummary = completion.choices[0]?.message?.content || '';
            chunkSummaries.push(chunkSummary);
            
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Error summarizing chunk ${i + 1}:`, error);
            if (error instanceof Error) {
              if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                throw new Error('Invalid API key. Please check your OpenAI API key.');
              } else if (error.message.includes('429') || error.message.includes('rate limit')) {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
              } else if (error.message.includes('quota')) {
                throw new Error('API quota exceeded. Please check your OpenAI billing.');
              }
            }
            chunkSummaries.push(`[Error summarizing part ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}]`);
          }
        }

        // Now summarize all the chunk summaries
        const combinedSummaries = chunkSummaries.join('\n\n');
        const finalCompletion = await freshOpenAI.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a professional summarizer. Your job is to create clear, structured summaries of YouTube video transcripts using the Pareto Principle (80/20 rule). Focus on the 20% of the content that provides 80% of the value — core insights, arguments, facts, and takeaways. Use bullet points and headers. Include a TL;DR at the end. Your tone should be concise, neutral, and informative — no fluff."
            },
            {
              role: "user",
              content: `Summarize the following transcript using the 80/20 rule:

1. Identify and list the most important insights, arguments, or concepts.
2. Structure the summary with clear headers and bullet points.
3. Use concise phrasing.
4. Include a TL;DR at the end with a 1–2 sentence high-level takeaway.

Transcript:
${combinedSummaries}`
            }
          ],
          max_tokens: 1000,
          temperature: 0.7,
        });

        summary = finalCompletion.choices[0]?.message?.content || '';
      }

      if (!summary) throw new Error('No summary generated');

      // Copy summary to clipboard
      try {
        await navigator.clipboard.writeText(summary);
      } catch (clipboardError) {
        console.warn('Clipboard API failed, using fallback method:', clipboardError);
        // Fallback: create a temporary textarea and copy from it
        const textArea = document.createElement('textarea');
        textArea.value = summary;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (fallbackError) {
          console.error('Fallback clipboard method also failed:', fallbackError);
        }
        document.body.removeChild(textArea);
      }

      // Create a new tab with the summary
      const summaryHtml = createSummaryHtml(videoId, String(marked.parse(summary)));
      const blob = new Blob([summaryHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });

    } catch (err) {
      console.error('Summary generation error:', err);
      if (err instanceof Error) {
        if (err.message.includes('429') || err.message.includes('quota')) {
          // Offer fallback option
          const useBasicSummary = confirm('API quota exceeded. Would you like to generate a basic summary without using AI? (This will use the first and last parts of the transcript)');
          if (useBasicSummary) {
            const basicSummary = createBasicSummary(transcript);
            try {
              await navigator.clipboard.writeText(basicSummary);
            } catch (clipboardError) {
              console.warn('Clipboard API failed for basic summary, using fallback method:', clipboardError);
              // Fallback: create a temporary textarea and copy from it
              const textArea = document.createElement('textarea');
              textArea.value = basicSummary;
              textArea.style.position = 'fixed';
              textArea.style.left = '-999999px';
              textArea.style.top = '-999999px';
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              try {
                document.execCommand('copy');
              } catch (fallbackError) {
                console.error('Fallback clipboard method also failed:', fallbackError);
              }
              document.body.removeChild(textArea);
            }
            const summaryHtml = createSummaryHtml(videoId, String(marked.parse(basicSummary)));
            const blob = new Blob([summaryHtml], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            chrome.tabs.create({ url });
            return; // Exit early since we handled it
          } else {
            summaryError = 'API quota exceeded. Please check your OpenAI billing and plan limits, or try the basic summary option.';
          }
        } else {
          summaryError = err.message;
        }
      } else {
        summaryError = 'An error occurred while generating summary';
      }
    } finally {
      summaryLoading = false;
    }
  }
</script>

<main class="p-4 w-80">
  <h1 class="text-lg font-bold mb-2">YT Wrap</h1>
  
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
    class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded flex items-center w-full"
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
      �� Set API Key
    {/if}
  </button>

  {#if error}
    <p class="text-red-600 text-sm mt-2">{error}</p>
  {/if}

  {#if summaryError}
    <p class="text-red-600 text-sm mt-2">{summaryError}</p>
  {/if}
</main>

