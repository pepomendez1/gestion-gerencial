const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://xfompqotwlywbizxcqfa.supabase.co',
  process.env.SUPABASE_KEY
);

const PROGRAMA = `
Unidad 1: EVOLUCIÓN DE LAS ORGANIZACIONES Y LA GESTIÓN GERENCIAL
Contenidos: Administración: origen, concepto y funciones. De la Revolución Industrial a la Globalización. Multilateralismo, Bilateralismo, Bloques. Impacto en la Gestión y en las TI. El mundo de las organizaciones: tecnología, diversidad y ética. Desempeño organizacional. Análisis de Contexto. La lógica de las organizaciones. Concepto de diseño organizacional.
Bibliografía: Drucker - La Administración en una Época de Grandes Cambios. Gates - Los Negocios en la Era Digital. Yip - Globalización.

Unidad 2: ORGANIZACIONES: PLANEACIÓN Y ESTRATEGIA
Contenidos: La Planeación organizacional. Cadena de valor. FODA. Planificación de las TI/SI. Estrategia y SI/TI. Gestión Estratégica. Organizaciones de aprendizaje y conocimiento corporativo. Plan de negocios, modelos de negocio y modelos de gestión. Los sistemas de información en la empresa.
Bibliografía: Andreu, Ricart & Valor - Estrategia y Sistemas de Información. Shank & Govindarajan - Gerencia Estratégica de Costos (Cap 4). Porter - Ventaja Competitiva.

Unidad 3: HERRAMIENTAS DE GESTIÓN GERENCIAL
Contenidos: Reingeniería. Benchmarking. Servucción. Diversificación, Desestratificación, Rightsizing, Logística, Mejora Continua. Organizaciones que aprenden. Trabajo Remoto. Liderazgo. Gestión. Los procesos y la Gestión de Cyberseguridad.
Bibliografía: Eiglier & Langerard - Servucción. Hammer & Champy - Reingeniería. Spendolini - Benchmarking. Senge - La Quinta Disciplina.

Unidad 4: CONTEXTOS Y ENTORNOS INNOVADORES
Contenidos: Creación de una empresa emprendedora. Transformación Digital. Estrategias de e-Business. IoT. Modelos evolutivos con PPP. Modelos con Venture Capitals. Start Up - Scale Up. Equipos de alto desempeño. Gestión de Restricciones (TOC). Inteligencia Artificial (AI).
Bibliografía: Goldratt & Goldratt - La Decisión. Senior & Singer - Start-Up Nation. Goldratt & Cox - La Meta.

Unidad 5: GESTIÓN ESTRATÉGICA
Contenidos: Empowerment. Inteligencia Emocional. Cuadro de mando integral (BSC), tablero de control y herramientas. Change Management. El teletrabajo y las herramientas de gestión. Responsabilidad social (RSE).
Bibliografía: Kaplan & Norton - The Execution Premium. Kaplan & Norton - Cuadro de Mando Integral. Kaplan & Norton - Mapas Estratégicos. ISO 26000. Senge - La Revolución Necesaria. Goleman - La Inteligencia Emocional.
`;

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
    const { messages, mode } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const BASE = "Tenes acceso a una base de conocimiento con los libros de la bibliografia obligatoria de Gestion Gerencial (Hammer y Champy - Reingenieria, Spendolini - Benchmarking, Eiglier y Langeard - Servuccion, Drucker, Gates, Porter, Goldratt, Kaplan y Norton, Senge, Goleman y otros). Los fragmentos relevantes te son provistos en cada consulta bajo FRAGMENTOS RELEVANTES DEL MATERIAL. SIEMPRE bastate en esos fragmentos como fuente principal y menciona el autor o libro cuando uses informacion de ellos. Si el usuario pregunta si tenes acceso a los libros, respondes que SI. Cuando te pidan un PDF, deciles que usen el boton PDF que aparece en cada respuesta.";

    const MODES = {
      material: `Sos un asistente de estudio de Gestion Gerencial universitaria. Respondes en espanol rioplatense, claro, estructurado y pedagogico. ${BASE} Usa titulos (###) y negritas (**texto**).`,
      actualidad: "Sos un asistente de estudio de Gestion Gerencial. Busca y presenta noticias relevantes de la ultima semana sobre economia, politica, tecnologia y gestion empresarial, especialmente de Argentina. Conecalas con conceptos de gestion cuando sea posible. Respondes en espanol rioplatense.",
      examen: `Sos un asistente de estudio de Gestion Gerencial. ${BASE} Genera preguntas de examen rigurosas basadas en el material con respuestas completas. Varia entre conceptuales, de aplicacion y analisis. Respondes en espanol rioplatense.`,
      resumen: `Sos un asistente de estudio de Gestion Gerencial. ${BASE} Hace resumenes completos y estructurados basados en los libros. Incluye conceptos principales, autores clave, teorias y ejemplos. Usa titulos (###) y negritas (**texto**). Respondes en espanol rioplatense.`,
    };

    let systemPrompt = MODES[mode] || MODES.material;
    systemPrompt += `\n\nPROGRAMA DE LA MATERIA:\n${PROGRAMA}`;

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
