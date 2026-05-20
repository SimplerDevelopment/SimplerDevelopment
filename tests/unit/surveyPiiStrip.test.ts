import { describe, it, expect } from 'vitest';
import { stripPiiFromText, stripPiiFromAnswers } from '@/lib/surveys/pii-strip';

describe('stripPiiFromText', () => {
  it('redacts email addresses', () => {
    expect(stripPiiFromText('Contact me at jane.doe+test@example.com.')).toBe(
      'Contact me at [email].',
    );
  });

  it('redacts US-style phone numbers', () => {
    expect(stripPiiFromText('Call (555) 123-4567 anytime.')).toBe('Call [phone] anytime.');
    expect(stripPiiFromText('555-123-4567')).toBe('[phone]');
    expect(stripPiiFromText('+1 555 123 4567')).toBe('[phone]');
  });

  it('redacts URLs but leaves bare hostnames alone', () => {
    expect(stripPiiFromText('See https://acme.example.com/page for details.')).toBe(
      'See [url] for details.',
    );
    expect(stripPiiFromText('We use acme.com for our work.')).toBe('We use acme.com for our work.');
  });

  it('does not redact short numeric runs (ratings, ids)', () => {
    expect(stripPiiFromText('I rate this 5 out of 10.')).toBe('I rate this 5 out of 10.');
    expect(stripPiiFromText('Issue #12345.')).toBe('Issue #12345.');
  });

  it('counts each replacement in stats', () => {
    const stats = { emails: 0, phones: 0, urls: 0 };
    stripPiiFromText('Email a@b.co and a@c.co, call 555-123-4567, see https://x.com', stats);
    expect(stats).toEqual({ emails: 2, phones: 1, urls: 1 });
  });

  it('leaves benign text unchanged', () => {
    expect(stripPiiFromText('The product is great!')).toBe('The product is great!');
  });
});

describe('stripPiiFromAnswers', () => {
  const fields = [
    { id: 'name', type: 'text' },
    { id: 'em', type: 'email' },
    { id: 'ph', type: 'phone' },
    { id: 'feedback', type: 'textarea' },
    { id: 'rating', type: 'rating' },
    { id: 'pets', type: 'checkbox' },
  ];

  it('drops the entire field for email-type and phone-type questions', () => {
    const { scrubbed } = stripPiiFromAnswers(
      { name: 'Jane', em: 'jane@example.com', ph: '555-123-4567', feedback: 'great' },
      fields,
    );
    expect(scrubbed).not.toHaveProperty('em');
    expect(scrubbed).not.toHaveProperty('ph');
    expect(scrubbed.name).toBe('Jane');
  });

  it('scrubs PII substrings inside text/textarea answers', () => {
    const { scrubbed } = stripPiiFromAnswers(
      { feedback: 'Reach me at jane@example.com or 555-123-4567.' },
      fields,
    );
    expect(scrubbed.feedback).toBe('Reach me at [email] or [phone].');
  });

  it('passes through non-string values (numbers, arrays)', () => {
    const { scrubbed } = stripPiiFromAnswers(
      { rating: 5, pets: ['Cat', 'Dog'] },
      fields,
    );
    expect(scrubbed.rating).toBe(5);
    expect(scrubbed.pets).toEqual(['Cat', 'Dog']);
  });

  it('reports counts across all answers', () => {
    const { stats } = stripPiiFromAnswers(
      { feedback: 'a@b.co and c@d.co, 555-123-4567' },
      fields,
    );
    expect(stats).toEqual({ emails: 2, phones: 1, urls: 0 });
  });

  it('returns empty stats when nothing is scrubbed', () => {
    const { stats } = stripPiiFromAnswers({ feedback: 'nice product' }, fields);
    expect(stats).toEqual({ emails: 0, phones: 0, urls: 0 });
  });
});
