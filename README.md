# TLDW (Too Long Didn't Watch)

TLDW is a Chrome extension that uses OpenAI to instantly summarize YouTube videos and answer your custom questions about their content. No more scrubbing through long videos—get the key points and answers you need, fast!

## Features

- **AI-Powered YouTube Summaries:**
  - Generate concise, structured summaries of any YouTube video using GPT-4o-mini.
  - Summaries use the Pareto Principle (80/20 rule) to focus on the most valuable content.
- **Transcript Extraction:**
  - Instantly extract the full transcript from the current YouTube video.
- **Summary Caching:**
  - Summaries are cached per video for instant recall—no need to re-generate unless you want to refresh.
- **Ask Questions About the Video:**
  - Type any question about the video (e.g., "What does the speaker say about climate change?") and get an AI-generated answer based on the transcript.
- **Q&A Caching and Log:**
  - All questions and answers are cached per video, with a log showing previous Q&As and timestamps.
  - If you ask the same question again, the cached answer is shown instantly.
- **API Key Management:**
  - Securely store and update your OpenAI API key in Chrome storage. Only prompted if no key is set.
- **Copy to Clipboard:**
  - Copy the transcript, summary, or any answer with one click.
- **Progress Feedback:**
  - See a progress bar and percentage during long summary generations.
- **Automatic Resume:**
  - When reopening the popup, cached summaries and Q&A logs are shown automatically for the current video.
- **Modern, Responsive UI:**
  - Clean, readable layout with clear sectioning for transcript, summary, and Q&A.

## How to Use

1. **Install the Extension:**
   - Load the unpacked extension in Chrome (see below for setup).
2. **Set Your OpenAI API Key:**
   - Click the key button and enter your OpenAI API key (starts with `sk-`).
3. **Go to Any YouTube Video:**
   - Open a video you want to summarize.
4. **Open the TLDW Popup:**
   - Click the TLDW extension icon in your Chrome toolbar.
5. **Generate a Summary:**
   - Click "Generate AI Summary". Wait for the summary to appear (progress bar shows status).
   - The summary is cached for instant recall next time.
6. **Ask Questions:**
   - Type your question in the input below the summary and click "Ask Question about Transcript".
   - The answer appears below, and is saved in the Q&A log for that video.
7. **Copy Content:**
   - Use the "Copy" buttons to copy the transcript, summary, or any answer.
8. **Refresh Summary:**
   - Click "Refresh Summary" to force a new summary (e.g., if the video transcript changes).

## Setup & Installation

1. **Clone this repo and install dependencies:**
   ```bash
   npm install
   ```
2. **Build the extension:**
   ```bash
   npm run build
   ```
3. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

## Technical Notes
- Uses Svelte, TypeScript, and Vite for a modern, fast UI.
- All AI features use OpenAI's GPT-4o-mini via your own API key (never sent to any server except OpenAI).
- Caching is handled via Chrome's local storage.
- No data is sent anywhere except OpenAI (for summaries/Q&A) and Chrome storage (for caching).

## Recent Features & Changes
- Complete speed optimizations (chunking, parallelization, parameter tuning, caching)
- Added Q&A feature with persistent log and instant recall
- Improved API key UX (no repeated prompts)
- Enhanced progress feedback and error handling
- UI/UX improvements: wider popup, better answer/question placement, timestamps, and more
- Rebranding from YT Wrap to TLDW

---

Enjoy faster, smarter YouTube learning with TLDW!
