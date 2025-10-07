const https = require('https');
const { logger } = require('../utils/logger');

const DEFAULT_TIMEOUT_MS = 28000;

function buildModel(mode) {
  return mode === 'thinking' ? 'LongCat-Flash-Thinking' : 'LongCat-Flash-Chat';
}

function chatCompletion({ baseUrl, apiKey, mode, messages, maxTokens = 800, stream = false, onChunk }) {
return new Promise((resolve, reject) => {
    const model = buildModel(mode);
    const body = JSON.stringify({
      model,
      messages,
      max_tokens: Math.min(maxTokens, 1000),
      stream
    });
    const url = new URL('/v1/chat/completions', baseUrl);
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: DEFAULT_TIMEOUT_MS - 1000
    };

    const req = https.request(url, opts, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBuf = '';
        res.on('data', d => { errBuf += d.toString(); });
        res.on('end', () => reject(new Error(`LongCat error ${res.statusCode}: ${errBuf}`)));
        return;
      }

      if (!stream) {
        let full = '';
        res.on('data', d => { full += d.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(full);
            const text = json.choices?.[0]?.message?.content || '';
            resolve({ text, raw: json });
          } catch (e) { reject(e); }
        });
        return;
      }

      res.setEncoding('utf8');
      let finalText = '';
      res.on('data', chunk => {
        const lines = chunk.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          if (line === 'data: [DONE]') {
            resolve({ text: finalText });
            return;
          }
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                finalText += delta;
                if (onChunk) onChunk(delta, finalText);
              }
            } catch (e) {
              logger.warn({ line }, 'Failed to parse streaming chunk');
            }
          }
        }
      });
      res.on('end', () => resolve({ text: finalText }));
    });

    req.on('error', reject);
    req.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error('LongCat request timeout'));
    });
    req.write(body);
    req.end();
  });
}

module.exports = { chatCompletion, buildModel };
