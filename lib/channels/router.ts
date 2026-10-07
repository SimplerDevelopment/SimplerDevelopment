// Deterministic intent router — phase 1 of the agent layer.
//
// Rules first, LLM later: every inbound message is classified by ordered
// regex rules (ES + EN) before any model is consulted. Cheap, explainable,
// and testable. When an LLM classifier lands, it only handles `unknown` —
// rules keep precedence so behavior never regresses silently.
//
// Rule order matters: human_request > complaint > booking > sales >
// billing > support > faq > greeting > unknown. A message matching several
// rules takes the first (highest-priority) one.

export type ChannelIntent =
  | 'greeting'
  | 'faq'
  | 'booking'
  | 'sales'
  | 'support'
  | 'billing'
  | 'complaint'
  | 'human_request'
  | 'unknown';

export interface IntentResult {
  intent: ChannelIntent;
  /** Which layer decided — always 'rule' until the LLM fallback exists. */
  decidedBy: 'rule';
  /** The rule that matched (for debugging / evals). */
  rule: string;
}

interface Rule {
  name: string;
  intent: ChannelIntent;
  patterns: RegExp[];
}

function w(...words: string[]): RegExp {
  return new RegExp(`\\b(${words.join('|')})\\b`, 'i');
}

const RULES: Rule[] = [
  {
    name: 'human_request',
    intent: 'human_request',
    patterns: [
      w('humano', 'human', 'persona', 'person', 'operador', 'operator', 'agente'),
      /habl[ao]r?\s+con\s+(un[a]?\s+)?(humano|persona|operador|agente|alguien)/i,
      /talk\s+to\s+(an?\s+)?(human|person|operator|agent|someone)/i,
      w('asesor', 'representante', 'encargado'),
    ],
  },
  {
    name: 'complaint',
    intent: 'complaint',
    patterns: [
      w('reclamo', 'queja', 'complaint', 'estafa', 'scam', 'fraude', 'denuncia', 'reembolso', 'devoluci[oó]n'),
      w('p[eé]simo', 'terrible', 'horrible', 'awful', 'worst'),
      /muy\s+(malo|mala|descontento)/i,
    ],
  },
  {
    name: 'booking',
    intent: 'booking',
    patterns: [
      w('reservar', 'reserva', 'book', 'booking', 'cita', 'appointment', 'turno', 'schedule', 'agendar', 'disponibilidad', 'availability', 'hueco', 'slot'),
    ],
  },
  {
    name: 'sales',
    intent: 'sales',
    patterns: [
      w('precio', 'price', 'precios', 'cu[aá]nto', 'cost', 'costo', 'cuesta', 'tarifa', 'rates'),
      w('comprar', 'buy', 'contratar', 'hire', 'adquirir', 'presupuesto', 'quote', 'cotizaci[oó]n', 'descuento', 'discount', 'oferta', 'offer', 'promo'),
      w('servicios', 'services', 'planes', 'plans', 'contratar'),
    ],
  },
  {
    name: 'billing',
    intent: 'billing',
    patterns: [
      w('factura', 'invoice', 'billing', 'facturaci[oó]n', 'pago', 'payment', 'cobro', 'charge', 'charged', 'suscripci[oó]n', 'subscription', 'stripe'),
    ],
  },
  {
    name: 'support',
    intent: 'support',
    patterns: [
      w('problema', 'problem', 'issue', 'error', 'falla', 'fallo', 'bug', ' roto', 'ayuda', 'help', 'soporte', 'support', 'arreglar', 'fix', 'funciona'),
      /no\s+(funciona|anda|abre|carga|puedo)/i,
      /(doesn'?t|does\s+not|not)\s+(work|open|load)/i,
    ],
  },
  {
    name: 'faq',
    intent: 'faq',
    patterns: [
      w('horario', 'hours', 'abierto', 'open', 'cierran', 'abren'),
      w('ubicaci[oó]n', 'location', 'direcci[oó]n', 'address', 'donde', 'where', 'llegar'),
      w('about', 'empresa', 'company', 'negocio'),
      w('contacto', 'contact', 'tel[eé]fono', 'phone', 'email', 'correo', 'whatsapp'),
      /qui[eé]nes?\s+son/i,
      /d[oó]nde\s+(est[aá]n|quedan|estais)/i,
    ],
  },
  {
    name: 'greeting',
    intent: 'greeting',
    patterns: [
      /^(hola|buenas|buenos?\s+d[ií]as|buenas?\s+(tardes|noches)|hey|hi|hello|alo|aló)\b/i,
    ],
  },
];

export function classifyIntent(text: string): IntentResult {
  const input = (text ?? '').trim();
  if (!input) return { intent: 'unknown', decidedBy: 'rule', rule: 'empty' };
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(input))) {
      return { intent: rule.intent, decidedBy: 'rule', rule: rule.name };
    }
  }
  return { intent: 'unknown', decidedBy: 'rule', rule: 'none' };
}
