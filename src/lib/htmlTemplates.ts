export function createTranscriptHtml(videoId: string, formattedTranscript: string) {
  return `
<html>
  <head>
    <meta charset="UTF-8">
    <title>Transcript for ${videoId}</title>
  </head>
  <body style="font-family: system-ui, sans-serif; background: #f9f9f9; margin: 0; padding: 0;">
    <div style="max-width: 800px; margin: 40px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px 24px;">
      <span style="color: #16a34a; margin-bottom: 24px; font-size: 1rem; vertical-align: middle; display: block;">Transcript copied to clipboard!</span>
      <pre id="transcript" style="background: #f3f4f6; border-radius: 6px; padding: 20px; font-size: 1.05rem; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; word-break: break-word;">${formattedTranscript.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      <button style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 16px; font-size: 0.9rem;" onclick="copyTranscript()">Copy Transcript Again</button>
    </div>
    <script>
      function copyTranscript() {
        const transcriptText = document.getElementById('transcript').textContent;
        navigator.clipboard.writeText(transcriptText).then(() => {
          const btn = document.querySelector('button');
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy Transcript Again';
          }, 2000);
        });
      }
    </script>
  </body>
</html>
`;
}

export function createSummaryHtml(videoId: string, summaryHtml: string) {
  return `<html>
  <head>
    <meta charset="UTF-8">
    <title>Summary for ${videoId}</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
      .container { max-width: 800px; margin: 40px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px 24px; }
      .title { color: #1f2937; margin-bottom: 24px; font-size: 1.5rem; font-weight: bold; }
      .copied-msg { color: #16a34a; margin-bottom: 24px; font-size: 1rem; vertical-align: middle; display: block; }
      .summary { background: #f3f4f6; border-radius: 6px; padding: 20px; font-size: 1.05rem; line-height: 1.6; word-break: break-word; }
      .summary h1, .summary h2, .summary h3, .summary h4, .summary h5, .summary h6 { 
        color: #1f2937; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; 
      }
      .summary h1 { font-size: 1.5rem; }
      .summary h2 { font-size: 1.3rem; }
      .summary h3 { font-size: 1.1rem; }
      .summary ul, .summary ol { margin: 0.5em 0; padding-left: 1.5em; }
      .summary li { margin: 0.3em 0; }
      .summary strong, .summary b { font-weight: 600; color: #1f2937; }
      .summary em, .summary i { font-style: italic; }
      .summary code { background: #e5e7eb; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }
      .summary blockquote { border-left: 4px solid #3b82f6; margin: 1em 0; padding-left: 1em; color: #6b7280; }
      .copy-btn { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-bottom: 16px; font-size: 0.9rem; }
      .copy-btn:hover { background: #2563eb; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="title">Video Summary (Pareto Principle)</div>
      <span class="copied-msg">Summary copied to clipboard!</span>
      <button class="copy-btn" onclick="copySummary()">Copy Summary Again</button>
      <div id="summary" class="summary">${summaryHtml}</div>
    </div>
    <script>
      function copySummary() {
        const summaryText = document.getElementById('summary').textContent;
        navigator.clipboard.writeText(summaryText).then(() => {
          const btn = document.querySelector('button');
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy Summary Again';
          }, 2000);
        });
      }
    </script>
  </body>
</html>`;
} 