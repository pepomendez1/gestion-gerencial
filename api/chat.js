const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://xfompqotwlywbizxcqfa.supabase.co',
  process.env.SUPABASE_KEY
);

async function searchDocuments(query) {
  const keywords = query
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 8)
    .join(' | ');

  if (!keywords) return [];

  const { data, error } = await supabase
    .from('documents')
    .select('content, source')
    .textSearch('fts', keywords, { config: 'spanish' })
    .limit(8);

  if (error) {
    console.error('Search error:', error.message);
    return [];
  }
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

    const MODES = {
      material: 'Sos un asistente de estudio de Gestión Gerencial universitaria. Respondés en español rioplatense, de forma clara, estructurada y pedagógica. Basate exhaustivamente en el material provisto. Usá títulos (###) y negritas (**texto**). Si algo no está en el material, indicalo.',
      actualidad: 'Sos un asistente de estudio de Gestión Gerencial. Buscá y presentá noticias relevantes de la última semana sobre economía, política, tecnología y gestión empresarial, especialmente de Argentina. Conectalas con conceptos de gestión cuando sea posible. Respondés en español rioplatense.',
      examen: 'Sos un asistente de estudio de Gestión Gerencial. Generá preguntas de examen rigurosas con sus respuestas completas. Variá entre preguntas conceptuales, de aplicación y análisis. Señalá temas más probables. Respondés en español rioplatense.',
      resumen: 'Sos un asistente de estudio de Gestión Gerencial. Hacé resúmenes completos y estructurados. Incluí conceptos principales, autores clave, teorías relevantes y ejemplos. Usá títulos (###) y negritas (**texto**). Respondés en español rioplatense.',
    };

    let systemPrompt = MODES[mode] || MODES.material;
    if (program) systemPrompt += `\n\nPROGRAMA DE LA MATERIA:\n${program}`;

    if (mode !== 'actualidad') {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      const query = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : lastUserMsg?.content?.[0]?.text || '';

      const docs = await searchDocuments(query);
      if (docs.length > 0) {
        const context = docs.map(d => `[${d.source}]\n${d.content}`).join('\n\n---\n\n');
        systemPrompt += `\n\nFRAGMENTOS RELEVANTES DEL MATERIAL:\n\n${context}`;
      }
    }

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    };

    if (mode === 'actualidad') {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: { message: e.message } });
  }
};
