// Reception agent — answers from tenant data, hands off everything else.

import { describe, it, expect } from 'vitest';
import {
  buildReceptionReply,
  requiresHandoff,
  type ReceptionContext,
} from '@/lib/channels/reception';

const CTX: ReceptionContext = {
  businessName: 'Peluquería Ana',
  greeting: null,
  services: [
    { title: 'Corte', durationMin: 30, priceLabel: '20€' },
    { title: 'Tinte', durationMin: 90, priceLabel: null },
  ],
};

describe('buildReceptionReply', () => {
  it('greets with the business name when no widget greeting exists', () => {
    const out = buildReceptionReply('greeting', CTX);
    expect(out.kind).toBe('reply');
    if (out.kind === 'reply') expect(out.text).toContain('Peluquería Ana');
  });

  it('prefers the tenant widget greeting when set', () => {
    const out = buildReceptionReply('greeting', { ...CTX, greeting: 'Bienvenido a Ana' });
    if (out.kind === 'reply') expect(out.text).toContain('Bienvenido a Ana');
  });

  it('lists real services for booking intent', () => {
    const out = buildReceptionReply('booking', CTX);
    expect(out.kind).toBe('reply');
    if (out.kind === 'reply') {
      expect(out.text).toContain('Corte');
      expect(out.text).toContain('30 min');
      expect(out.text).toContain('20€');
    }
  });

  it('hands off booking when there are no services to offer', () => {
    const out = buildReceptionReply('booking', { ...CTX, services: [] });
    expect(out.kind).toBe('handoff');
  });

  it('hands off support, complaints, billing, human requests and unknowns', () => {
    for (const intent of ['support', 'complaint', 'billing', 'human_request', 'unknown', 'faq'] as const) {
      const out = buildReceptionReply(intent, { ...CTX, services: [] });
      expect(out.kind).toBe('handoff');
    }
  });

  it('sales promises a human AND requires the aiMode flip', () => {
    const out = buildReceptionReply('sales', CTX);
    expect(out.kind).toBe('handoff');
    expect(requiresHandoff(out)).toBe(true);
  });

  it('never invents hours or location', () => {
    const out = buildReceptionReply('faq', { ...CTX, services: [] });
    expect(out.kind).toBe('handoff');
  });

  it('provides the real booking link and accepts the offered service name', () => {
    const context = { ...CTX, services: [{ ...CTX.services[0], bookingUrl: 'https://ana.test/book/corte' }] };
    for (const [intent, text] of [['booking', 'quiero una cita'], ['unknown', 'Corte']] as const) {
      const out = buildReceptionReply(intent, context, text);
      expect(out.kind).toBe('reply');
      expect(out.text).toContain('https://ana.test/book/corte');
    }
  });

  it('does not answer an hours question with the service catalogue', () => {
    expect(buildReceptionReply('faq', CTX, '¿Cuál es el horario?').kind).toBe('handoff');
    const out = buildReceptionReply('faq', { ...CTX, address: 'Calle Real 12' }, '¿Dónde estáis?');
    expect(out.text).toContain('Calle Real 12');
  });
});
