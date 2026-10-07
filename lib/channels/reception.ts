// Reception agent (deterministic v1) — the first of the eight domain agents.
//
// Scope discipline: this agent NEVER invents. It answers only from tenant
// data passed in ReceptionContext (business name, widget greeting, bookable
// services with real durations/prices). Anything it cannot answer from data
// — hours, location, custom quotes — becomes a handoff, not a guess. An LLM
// with Brain lookup replaces the reply composer later; the handoff contract
// (reply vs. handoff + aiMode flip) stays the same.

import type { ChannelIntent } from './router';

export interface ReceptionService {
  title: string;
  durationMin: number;
  priceLabel: string | null;
  bookingUrl?: string;
}

export interface ReceptionContext {
  businessName: string;
  /** Widget greeting configured by the tenant (may be null). */
  greeting: string | null;
  address?: string | null;
  /** Bookable services with real durations/prices (may be empty). */
  services: ReceptionService[];
}

export type ReceptionOutcome =
  | { kind: 'reply'; text: string }
  | { kind: 'handoff'; text: string };

function servicesLine(services: ReceptionService[]): string {
  return services
    .map((s) => `• ${s.title} (${s.durationMin} min${s.priceLabel ? `, ${s.priceLabel}` : ''})${s.bookingUrl ? ` — ${s.bookingUrl}` : ''}`)
    .join('\n');
}

export function buildReceptionReply(
  intent: ChannelIntent,
  ctx: ReceptionContext,
  visitorText: string = '',
): ReceptionOutcome {
  const name = ctx.businessName || 'nuestro negocio';
  switch (intent) {
    case 'greeting': {
      const base = ctx.greeting?.trim() || `¡Hola! Gracias por contactar con ${name}.`;
      return {
        kind: 'reply',
        text: `${base} ¿En qué puedo ayudarte? Puedo informarte sobre nuestros servicios o ayudarte a reservar una cita.`,
      };
    }
    case 'faq': {
      if (/ubicaci[oó]n|direcci[oó]n|d[oó]nde|address|location|where/i.test(visitorText) && ctx.address) {
        return {
          kind: 'reply',
          text: `Nuestra dirección es: ${ctx.address}`,
        };
      }
      return handoff();
    }
    case 'booking': {
      if (ctx.services.length > 0) {
        return {
          kind: 'reply',
          text: `Puedes consultar la disponibilidad y reservar en la página de cada servicio:\n${servicesLine(ctx.services)}`,
        };
      }
      return handoff();
    }
    case 'sales': {
      // Handoff (not a plain reply): the text promises a human, so aiMode
      // must flip — sales qualification needs one until the Sales agent
      // (phase 11) exists.
      return {
        kind: 'handoff',
        text: '¡Genial que te interese! Te estoy pasando con alguien del equipo para prepararte una propuesta a medida.',
      };
    }
    case 'support':
    case 'complaint':
    case 'billing':
    case 'human_request':
    case 'unknown':
    default: {
      if (intent === 'unknown') {
        const matched = ctx.services.find(s => s.title.toLocaleLowerCase() === visitorText.trim().toLocaleLowerCase());
        if (matched?.bookingUrl) return { kind: 'reply', text: `Consulta la disponibilidad y reserva ${matched.title}: ${matched.bookingUrl}` };
      }
      return handoff();
    }
  }
}

/**
 * Handoff message + the caller MUST flip the conversation aiMode to 'human'
 * so the loop doesn't re-trigger on the next visitor message.
 */
function handoff(): ReceptionOutcome {
  return {
    kind: 'handoff',
    text: 'Esta consulta necesita una persona del equipo. La conversación queda pendiente de atención; el tiempo de respuesta depende de su disponibilidad.',
  };
}

/** True when the outcome requires the caller to disable AI for the conversation. */
export function requiresHandoff(outcome: ReceptionOutcome): boolean {
  return outcome.kind === 'handoff';
}
