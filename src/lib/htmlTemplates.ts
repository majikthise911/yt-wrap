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

// createSummaryHtml removed as summary page now uses static HTML and loads summary from storage 