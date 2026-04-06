const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://xfompqotwlywbizxcqfa.supabase.co',
  process.env.SUPABASE_KEY
);

async function searchDocuments(query) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const embRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({ input: query, model: 'text-embedding-3-small' }),
  });
  const embData = await embRes.json();
  if (!embData.data) { console.error('Embedding error:', JSON.stringify(embData)); return []; }
  const embedding = embData.data[0].embedding;
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding, match_threshold: 0.3, match_count: 8,
  });
  if (error) { console.error('Search error:', error.message); return []; }
  return data || [];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, mode, program } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const BASE = "Tenes acceso a una base de conocimiento con los libros de la bibliografia obligatoria de la materia Gestion Gerencial (Hammer y Champy sobre Reingenieria, Spendolini sobre Benchmarking, Eiglier y Langeard sobre Servuccion, Drucker, Gates, Porter, Goldratt, Kaplan y Norton, Senge, y otros). Los fragmentos relevantes de esos libros te son provistos en cada consulta bajo FRAGMENTOS RELEVANTES DEL MATERIAL. SIEMPRE bastate en esos fragmentos como fuente principal y menciona el autor o libro cuando uses informacion de ellos. Si el usuario pregunta si tenes acceso a los libros, respondes que SI, que tenes la bibliografia de la catedra cargada en tu base de conocimiento. Cuando te pidan generar un PDF, deciles que usen el boton PDF que aparece en cada respuesta.";

    const MODES = {
      material: `Sos un asistente de estudio de Gestion Gerencial universitaria. Respones en espanol rioplatense, de forma clara, estructurada y pedagogica. ${BASE} Usa titulos (###) y negritas (**texto**).`,
      actualidad: "Sos un asistente de estudio de Gestion Gerencial. Busca y presenta noticias relevantes de la ultima semana sobre economia, politica, tecnologia y gestion empresarial, especialmente de Argentina. Conecalas con conceptos de gestion cuando sea posible. Respondes en espanol rioplatense.",
      examen: `Sos un asistente de estudio de Gestion Gerencial. ${BASE} Genera preguntas de examen rigurosas basadas en los fragmentos del material con sus respuestas completas. Varia entre preguntas conceptuales, de aplicacion y analisis. Senala temas mas probables. Respondes en espanol rioplatense.`,
      resumen: `Sos un asistente de estudio de Gestion Gerencial. ${BASE} Hace resumenes completos y estructurados basados en el material de los libros. Incluye conceptos principales, autores clave, teorias relevantes y ejemplos. Usa titulos (###) y negritas (**texto**). Respondes en espanol rioplatense.`,
    };

    let systemPrompt = MODES[mode] || MODES.material;
    if (program) systemPrompt += `\n\nPROGRAMA DE LA MATERIA:\n${program}`;

    if (mode !== 'actualidad') {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      const query = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content : lastUserMsg?.content?.[0]?.text || '';
      const docs = await searchDocuments(query);
      if (docs.length > 0) {
        const context = docs.map(d => `[${d.source}]\n${d.content}`).join('\n\n---\n\n');
        systemPrompt += `\n\nFRAGMENTOS RELEVANTES DEL MATERIAL:\n\n${context}`;
      }
    }

    const body = { model: 'claude-sonnet-4-20250514', max_tokens: 8192, system: systemPrompt, messages };
    if (mode === 'actualidad') body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: { message: e.message } });
  }
};
