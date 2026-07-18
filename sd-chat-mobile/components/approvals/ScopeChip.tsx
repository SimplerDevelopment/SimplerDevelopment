import { Text, View } from 'react-native';

import { T } from '@/lib/theme';
import type { ApprovalScope } from '@/lib/mock/approvals';

/**
 * Per-scope color palette — canonical mapping for `<scope>.<read|write|send>`
 * tokens. Used in the inbox row chip, single-approval header chip, bulk row
 * chip, and audit export scope picker.
 *
 * Stay in lockstep with the SCOPE table in the approvals mockup.
 */
const SCOPE_COLORS: Record<string, { bg: string; fg: string }> = {
  'crm.write': { bg: '#DBEAFE', fg: '#1D4ED8' },
  'crm.read': { bg: '#DBEAFE', fg: '#1D4ED8' },
  'posts.write': { bg: '#FFF1E5', fg: '#C2410C' },
  'email.send': { bg: '#FEE6E6', fg: '#B91C1C' },
  'brain.write': { bg: '#F3EAFE', fg: '#7C3AED' },
  'brain.read': { bg: '#F3EAFE', fg: '#7C3AED' },
  'tickets.write': { bg: '#E0FAF6', fg: '#0E7C70' },
  'kanban.write': { bg: '#FFF8DB', fg: '#92580E' },
  'media.write': { bg: '#FFE6F1', fg: '#BE185D' },
  'store.write': { bg: '#E6F3FF', fg: '#1E40AF' },
};

export type ScopeChipProps = {
  scope: ApprovalScope | string;
};

export function ScopeChip({ scope }: ScopeChipProps) {
  const c = SCOPE_COLORS[scope] ?? { bg: T.bgSubtle, fg: T.textSecondary };
  return (
    <View
      style={{
        backgroundColor: c.bg,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 5,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: c.fg,
          fontSize: 9.5,
          fontWeight: '700',
          letterSpacing: 0.4,
          fontFamily: 'Menlo',
        }}
      >
        {scope}
      </Text>
    </View>
  );
}

export default ScopeChip;
