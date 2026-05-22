// @vitest-environment node
/**
 * Pure-function unit tests for lib/brain/playbook-templating.
 *
 * Substitution semantics:
 *   - {{var.path}} → resolved value (stringified)
 *   - missing paths → empty string
 *   - objects/arrays as leaf → JSON.stringify
 *   - no escaping
 *   - keys are NOT templated, only values
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate, renderObject } from '@/lib/brain/playbook-templating';

const CTX = {
  person: { fullName: 'Jane Doe', email: 'jane@example.com' },
  company: { name: 'Acme' },
  count: 5,
  tags: ['a', 'b'],
};

describe('renderTemplate', () => {
  it('substitutes a single placeholder', () => {
    expect(renderTemplate('Hello {{person.fullName}}!', CTX)).toBe('Hello Jane Doe!');
  });

  it('substitutes multiple placeholders', () => {
    expect(renderTemplate('{{person.fullName}} <{{person.email}}> @ {{company.name}}', CTX))
      .toBe('Jane Doe <jane@example.com> @ Acme');
  });

  it('renders missing paths as empty string', () => {
    expect(renderTemplate('Hi {{person.absent}}!', CTX)).toBe('Hi !');
    expect(renderTemplate('{{nonexistent}}{{also.gone}}', CTX)).toBe('');
  });

  it('coerces numbers and booleans to string', () => {
    expect(renderTemplate('count={{count}}', CTX)).toBe('count=5');
  });

  it('JSON-stringifies arrays and objects', () => {
    expect(renderTemplate('tags={{tags}}', CTX)).toBe('tags=["a","b"]');
    expect(renderTemplate('person={{person}}', CTX)).toBe('person={"fullName":"Jane Doe","email":"jane@example.com"}');
  });

  it('returns the template verbatim when there are no placeholders', () => {
    expect(renderTemplate('plain text', CTX)).toBe('plain text');
  });

  it('returns empty string when the template is not a string', () => {
    // @ts-expect-error — feeding a non-string intentionally
    expect(renderTemplate(null, CTX)).toBe('');
  });

  it('does not escape — outputs the raw resolved value', () => {
    expect(renderTemplate(
      '<b>{{person.fullName}}</b>',
      { person: { fullName: '<script>x</script>' } },
    )).toBe('<b><script>x</script></b>');
  });

  it('tolerates whitespace inside braces', () => {
    expect(renderTemplate('Hello {{  person.fullName  }}!', CTX)).toBe('Hello Jane Doe!');
  });
});

describe('renderObject', () => {
  it('renders string values; leaves keys alone', () => {
    const out = renderObject({
      title: 'Welcome {{person.fullName}}',
      static: 'no vars here',
    }, CTX);
    expect(out).toEqual({
      title: 'Welcome Jane Doe',
      static: 'no vars here',
    });
  });

  it('leaves non-string leaves untouched', () => {
    const out = renderObject({
      title: 'x',
      count: 42,
      flag: true,
      missing: null,
    }, CTX);
    expect(out.count).toBe(42);
    expect(out.flag).toBe(true);
    expect(out.missing).toBeNull();
  });

  it('recurses into nested objects', () => {
    const out = renderObject({
      outer: {
        inner: 'Hi {{person.fullName}}',
        deep: { greeting: 'Hello {{company.name}}' },
      },
    }, CTX);
    expect(out).toEqual({
      outer: {
        inner: 'Hi Jane Doe',
        deep: { greeting: 'Hello Acme' },
      },
    });
  });

  it('walks array elements', () => {
    const out = renderObject({
      list: ['plain', 'hi {{person.fullName}}', 42],
    }, CTX);
    expect(out.list).toEqual(['plain', 'hi Jane Doe', 42]);
  });

  it('handles a missing-path inside a nested object', () => {
    const out = renderObject({ title: '{{person.absent}}!' }, CTX);
    expect(out.title).toBe('!');
  });
});
