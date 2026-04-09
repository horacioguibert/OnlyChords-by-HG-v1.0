const https = require("https");

function tryModel(model, postData, apiKey) {
  return new Promise((resolve) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: "/v1beta/models/" + model + ":generateContent?key=" + apiKey,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return resolve({ ok: false, error: parsed.error.message });
          const txt = parsed.candidates[0].content.parts[0].text;
          resolve({ ok: true, txt });
        } catch(e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });
    req.on("error", e => resolve({ ok: false, error: e.message }));
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const query = req.body && req.body.query ? req.body.query : null;
  if (!query) return res.status(400).json({ error: "Falta query" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Sin API key" });

  const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"];

  const prompt = `Return ONLY a valid JSON object for the song "${query}". No markdown, no backticks, no explanation. Structure:
{"titulo":"Song Name","artista":"Artist","genero":"jazz","compas":"4/4","secciones":[{"label":"ESTROFA","compases":[{"beats":[{"chord":"Am","note":""}],"lyric":"lyric line"}]}]}
Valid labels: INTRO ESTROFA ESTRIBILLO PUENTE OUTRO. Valid genres: pop jazz rock blues bossa metal clasico. Real chords. Max 4 sections, 8 bars each.`;

  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 3000 }
  });

  let lastError = "";

  for (const model of MODELS) {
    const result = await tryModel(model, postData, apiKey);
    if (!result.ok) { lastError = model + ": " + result.error; continue; }

    const txt = result.txt;
    const first = txt.indexOf("{");
    const last = txt.lastIndexOf("}");
    if (first === -1) { lastError = model + ": no JSON"; continue; }

    try {
      const json = JSON.parse(txt.substring(first, last + 1));
      if (!json.titulo || !json.secciones) { lastError = model + ": invalid structure"; continue; }
      return res.status(200).json(json);
    } catch(e) {
      lastError = model + ": parse error";
      continue;
    }
  }

  return res.status(500).json({ error: "Error: " + lastError });
};
