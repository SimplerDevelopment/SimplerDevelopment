import { Pressable, Text, View } from 'react-native';

import { AiAvatar, MIcon } from '@/components/atoms';
import type { Approval } from '@/lib/mock/approvals';
import { T } from '@/lib/theme';
import { ScopeChip } from './ScopeChip';

export type ApprovalRowProps = {
  approval: Approval;
  onPress?: () => void;
  /** When true, divider below the row is suppressed (last item in a group). */
  last?: boolean;
  /** Optional checkbox slot for bulk-select mode. */
  leading?: React.ReactNode;
};

/**
 * Inbox row that composes AiAvatar + ScopeChip + tool-name + arg-preview + time.
 * Destructive approvals get a small red delete badge on the avatar; "sends"
 * (email_campaigns_send) gets a SENDS pill next to the tool name.
 */
export function ApprovalRow({ approval, onPress, last, leading }: ApprovalRowProps) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 11,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: T.rowDivider,
      }}
    >
      {leading}

      <View style={{ position: 'relative' }}>
        <AiAvatar size={32} ring={false} />
        {approval.destructive ? (
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: T.danger,
              borderWidth: 2,
              borderColor: T.bgCard,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name="delete" size={9} color="white" />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <ScopeChip scope={approval.scope} />
          <Text
            style={{
              fontFamily: 'Menlo',
              fontSize: 11.5,
              color: T.textPrimary,
              fontWeight: '600',
              letterSpacing: -0.2,
            }}
          >
            {approval.tool}
          </Text>
          {approval.warn ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 1.5,
                borderRadius: 999,
                backgroundColor: '#FEE6E6',
              }}
            >
              <MIcon name="send" size={9} color="#B91C1C" />
              <Text
                style={{
                  color: '#B91C1C',
                  fontSize: 9,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                SENDS
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 13.5,
            color: T.textPrimary,
            fontWeight: '500',
            lineHeight: 18,
            letterSpacing: -0.1,
          }}
        >
          {approval.description}
        </Text>
        <Text
          style={{
            fontSize: 11.5,
            color: T.textTertiary,
            marginTop: 3,
            letterSpacing: -0.05,
          }}
        >
          {approval.meta}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
        <Text style={{ fontSize: 11, color: T.textTertiary, fontWeight: '500' }}>
          {approval.time}
        </Text>
        <MIcon name="chevron_right" size={18} color={T.textTertiary} />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: T.borderLight }}>
        {({ pressed }) => (
          <View style={{ backgroundColor: pressed ? T.bgSubtle : 'transparent' }}>
            {body}
          </View>
        )}
      </Pressable>
    );
  }
  return body;
}

export default ApprovalRow;
