// Basic formatting & sanitization for Telegram-safe Markdown (MarkdownV2 not used; plain markdown subset)
// Escapes backticks and ensures bullets, headings trimmed.
function formatAnswer(raw) {
  if (!raw) return '';
  let text = raw.trim();
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/`/g, '\u200b`');
  if (text.length > 3900) {
    text = text.slice(0, 3850) + '\n…(truncated)';
  }
  return text;
}

module.exports = { formatAnswer };