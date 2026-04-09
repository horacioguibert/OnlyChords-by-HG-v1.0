const https = require("https");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = req.body && req.body.query ? req.body.query : null;
  if (!query) return res.status(400).json({ error: "Falta query" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Sin API key" });

  const prompt = `Return ONLY a valid JSON object for the song "${query}". No markdown, no backticks, no explanation. Use this exact structure:
{"titulo":"Song Name","artista":"Artist","genero":"jazz","compas":"4/4","secciones":[{"label":"ESTROFA","compases":[{"beats":[{"chord":"Am","note":""}],"lyric":"lyric line"}]}]}
Valid labels: INTRO ESTROFA ESTRIBILLO PUENTE OUTRO. Valid genres: pop jazz rock blues bossa metal clasico. Real chords. Max 4 sections, 8 bars each.`;

  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 3000 }
  });

  const options = {
    hostname: "generativelanguage.googleapis.com",
    path: "/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve) => {
    const request = https.request(options, (response) => {
      let data = "";
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => {
        try {
          const geminiData = JSON.parse(data);

          if (geminiData.error) {
            res.status(500).json({ error: geminiData.error.code + ": " + geminiData.error.message });
            return resolve();
          }

          const txt = geminiData.candidates[0].content.parts[0].text;
          const first = txt.indexOf("{");
          const last = txt.lastIndexOf("}");

          if (first === -1) {
            res.status(500).json({ error: "No JSON encontrado. Gemini dijo: " + txt.substring(0, 200) });
            return resolve();
          }

          const result = JSON.parse(txt.substring(first, last + 1));
          res.status(200).json(result);
          resolve();

        } catch(e) {
          res.status(500).json({ error: "Error: " + e.message + " | Raw: " + data.substring(0, 200) });
          resolve();
        }
      });
    });

    request.on("error", e => {
      res.status(500).json({ error: "Request error: " + e.message });
      resolve();
    });

    request.write(postData);
    request.end();
  });
};
