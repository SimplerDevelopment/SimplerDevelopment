import { Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { T } from '@/lib/theme';

/**
 * Minimal markdown renderer for brain note + decision bodies.
 *
 * Intentionally NOT a full CommonMark implementation — there's no spec-compliant
 * markdown library lightweight enough to vendor without a dep, and the bodies
 * we receive are user/agent-authored markdown with a narrow vocabulary:
 *
 *   - `# / ## / ### ` headings
 *   - `- ` and `* ` unordered bullets
 *   - `- [ ]` / `- [x]` checkboxes
 *   - blank lines as paragraph separators
 *   - inline `**bold**`, `*em*`, and `` `code` ``
 *
 * Anything more exotic (tables, fenced code blocks, links with titles) falls
 * back to plain rendering so the reader sees the underlying markdown rather
 * than a broken render. Good enough for the dev-DB seed data and most user
 * notes; a real markdown lib can replace this when we hit the limit.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: React.ReactNode[] = [];
  let paraBuffer: string[] = [];

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    blocks.push(
      <Para key={`p-${blocks.length}`} text={paraBuffer.join(' ').trim()} />,
    );
    paraBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\r$/, '');

    if (line.trim() === '') {
      flushPara();
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      flushPara();
      blocks.push(<Heading key={`h3-${i}`} level={3} text={h3[1]} />);
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      flushPara();
      blocks.push(<Heading key={`h2-${i}`} level={2} text={h2[1]} />);
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      flushPara();
      blocks.push(<Heading key={`h1-${i}`} level={1} text={h1[1]} />);
      continue;
    }

    const todo = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (todo) {
      flushPara();
      blocks.push(
        <Checkbox
          key={`c-${i}`}
          checked={todo[1].toLowerCase() === 'x'}
          text={todo[2]}
        />,
      );
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      blocks.push(<Bullet key={`b-${i}`} text={bullet[1]} />);
      continue;
    }

    paraBuffer.push(line);
  }
  flushPara();

  return <View>{blocks}</View>;
}

function Heading({ level, text }: { level: 1 | 2 | 3; text: string }) {
  const size = level === 1 ? 18 : level === 2 ? 16 : 14;
  const weight = level === 1 ? '700' : '600';
  return (
    <Text
      style={{
        fontSize: size,
        fontWeight: weight as '700' | '600',
        color: T.textPrimary,
        marginTop: level === 1 ? 8 : 14,
        marginBottom: 6,
        letterSpacing: -0.2,
      }}
    >
      <Inline source={text} />
    </Text>
  );
}

function Para({ text }: { text: string }) {
  return (
    <Text
      style={{
        fontSize: 14,
        color: T.textPrimary,
        lineHeight: 22,
        marginBottom: 10,
      }}
    >
      <Inline source={text} />
    </Text>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        marginBottom: 4,
        paddingLeft: 4,
      }}
    >
      <Text
        style={{ fontSize: 14, color: T.textSecondary, lineHeight: 22 }}
      >
        •
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          color: T.textPrimary,
          lineHeight: 22,
        }}
      >
        <Inline source={text} />
      </Text>
    </View>
  );
}

function Checkbox({ checked, text }: { checked: boolean; text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 4,
        paddingLeft: 2,
      }}
    >
      <MIcon
        name={checked ? 'check_box' : 'check_box_outline_blank'}
        size={18}
        color={checked ? T.success : T.textTertiary}
        fill={checked ? 1 : 0}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          color: checked ? T.textTertiary : T.textPrimary,
          lineHeight: 22,
          textDecorationLine: checked ? 'line-through' : 'none',
        }}
      >
        <Inline source={text} />
      </Text>
    </View>
  );
}

/**
 * Render the inline subset: **bold**, *em*, `code`. Tokens are matched greedily
 * left-to-right; unmatched markers render as their literal characters.
 */
function Inline({ source }: { source: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push(source.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <Text key={`b-${key++}`} style={{ fontWeight: '700' }}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <Text
          key={`c-${key++}`}
          style={{
            fontFamily: 'Courier',
            backgroundColor: T.bgSubtle,
            paddingHorizontal: 3,
            color: T.textPrimary,
          }}
        >
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith('*')) {
      parts.push(
        <Text key={`i-${key++}`} style={{ fontStyle: 'italic' }}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }
  return <>{parts}</>;
}

export default Markdown;
