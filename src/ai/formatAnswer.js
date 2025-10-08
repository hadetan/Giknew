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