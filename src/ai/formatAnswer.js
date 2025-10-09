function formatAnswer(raw) {
    if (!raw) return '';
    let text = raw.trim();
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/`/g, '\u200b`');
    if (text.length > 3900) {
        text = text.slice(0, 3850) + '\n…(truncated)';
    }

    const rewrites = [
        [/Based on the provided context,\s*/gi, 'From what I can see, '],
        [/If this is incorrect or you need further verification, additional context \(e\.g\., your exact username\) would be required\./gi, "If that looks wrong, tell me the exact username and I'll try again."],
        [/However, the context does not explicitly confirm your exact username or profile link\./gi, "I don't have explicit confirmation of the exact username from the data."]
    ];
    for (const [pat, repl] of rewrites) {
        text = text.replace(pat, repl);
    }
    return text;
}

module.exports = { formatAnswer };