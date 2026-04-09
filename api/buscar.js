const https = require('https');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  // ── SERVIR guitar.json ──────────────────────────────────
  if (req.method === 'GET' && req.url && req.url.includes('guitar')) {
    try {
      const filePath = path.join(process.cwd(), 'public', 'guitar.json');
      const data = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(data);
    } catch(e) {
      return res.status(500).json({ error: 'No se pudo leer guitar.json: ' + e.message });
    }
  }

  // ── BUSCAR CANCIÓN ──────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Falta query' });

  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  const API_KEY = process.env.GEMINI_API_KEY;

  const prompt = `Devuelve SOLO JSON válido sin texto extra ni markdown.
Busca la canción: "${query}"
Formato exacto:
{"titulo":"...","artista":"...","genero":"...","compas":"4/4","secciones":[{"nombre":"ESTROFA","compases":[{"acordes":["G"],"letra":"Yesterday"},{"acordes":["D","Em"],"letra":"all my troubles"}]}]}
Máximo 4 secciones, máximo 8 compases por sección. Solo JSON.`;

  let lastError = '';
  for (const model of MODELS) {
    try {
      const result = await callGemini(API_KEY, model, prompt);
      if (result.ok) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(result.text);
      }
      lastError = result.error;
    } catch(e) {
      lastError = e.message;
    }
  }
  return res.status(500).json({ error: lastError });
};

function callGemini(apiKey, model, prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 3000 }
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return resolve({ ok: false, error: `${model}: ${parsed.error.message}` });
          let text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          text = text.replace(/```json|```/g, '').trim();
          const start = text.indexOf('{'), end = text.lastIndexOf('}');
          if (start === -1 || end === -1) return resolve({ ok: false, error: 'JSON no encontrado' });
          text = text.slice(start, end + 1);
          JSON.parse(text); // validar
          resolve({ ok: true, text });
        } catch(e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}
