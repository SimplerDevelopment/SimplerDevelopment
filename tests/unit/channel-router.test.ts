// Deterministic intent router — rule precedence + ES/EN coverage.

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '@/lib/channels/router';

describe('classifyIntent', () => {
  it('greets in ES and EN', () => {
    expect(classifyIntent('Hola, buenas').intent).toBe('greeting');
    expect(classifyIntent('Hello there').intent).toBe('greeting');
    expect(classifyIntent('buenos días').intent).toBe('greeting');
  });

  it('routes booking requests', () => {
    expect(classifyIntent('Quiero reservar una cita').intent).toBe('booking');
    expect(classifyIntent('Do you have any availability tomorrow?').intent).toBe('booking');
    expect(classifyIntent('necesito un turno').intent).toBe('booking');
  });

  it('routes price questions to sales, not faq', () => {
    expect(classifyIntent('¿Cuánto cuesta?').intent).toBe('sales');
    expect(classifyIntent('What is the price?').intent).toBe('sales');
    expect(classifyIntent('quiero un presupuesto').intent).toBe('sales');
  });

  it('routes billing', () => {
    expect(classifyIntent('Tengo un problema con mi factura').intent).toBe('billing');
    expect(classifyIntent('I was charged twice').intent).toBe('billing');
  });

  it('routes support problems', () => {
    expect(classifyIntent('No me funciona el login').intent).toBe('support');
    expect(classifyIntent('Necesito ayuda con mi cuenta').intent).toBe('support');
  });

  it('routes complaints', () => {
    expect(classifyIntent('Quiero poner un reclamo, esto es una estafa').intent).toBe('complaint');
  });

  it('human requests win over everything', () => {
    expect(classifyIntent('hola, quiero hablar con un humano sobre precios').intent).toBe('human_request');
    expect(classifyIntent('talk to an agent please').intent).toBe('human_request');
  });

  it('routes faq (hours / location / contact)', () => {
    expect(classifyIntent('¿Cuál es su horario?').intent).toBe('faq');
    expect(classifyIntent('¿Dónde están ubicados?').intent).toBe('faq');
  });

  it('returns unknown for empty or unmatched input', () => {
    expect(classifyIntent('').intent).toBe('unknown');
    expect(classifyIntent('   ').intent).toBe('unknown');
    expect(classifyIntent('xqz ptlm 123').intent).toBe('unknown');
  });

  it('always reports rule-based provenance', () => {
    expect(classifyIntent('hola').decidedBy).toBe('rule');
  });
});
