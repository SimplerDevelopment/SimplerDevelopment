import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/** Live-execution status for the streaming chat path. */
export type ToolUseStatus = 'running' | 'done' | 'error' | 'pending';

export type ToolUseCardProps = {
  /** Tool name, monospaced, e.g. `crm_deals_create`. */
  tool: string;
  /** Required scope chip, e.g. `crm.write`. */
  scope: string;
  /** Ordered list of key/value pairs to render as args. */
  args: Array<[string, string]>;
  /** Shown in the confirmation toast after Approve. Falls back to a generic line. */
  confirmText?: string;
  onApprove?: () => void;
  onEdit?: () => void;
  onDecline?: () => void;
  /**
   * Live-execution mode. When set, the card renders running / done / error
   * status (for the streaming chat path where tools auto-execute) instead of
   * the Approve / Edit / Decline approval flow. Leave undefined for the
   * human-in-the-loop approval card (mockup screen 02 / future P0.3).
   */
  status?: ToolUseStatus;
  /** Short summary of the tool result, shown in the footer when `status` is set. */
  result?: string;
  /**
   * When `status === 'pending'` (the write was staged for human approval),
   * renders a "Review in Approvals" affordance that calls this. Typically
   * deep-links to the approvals inbox item.
   */
  onReview?: () => void;
};

const MONO = 'Menlo';

/**
 * The `crm_deals_create`-style approval card from sd-chat-mockup screen 02.
 * Header (gradient bolt icon + tool name + scope chip) → key/value args →
 * Approve / Edit / Decline button row. Approve flips into a brief inline
 * confirmation banner.
 */
export function ToolUseCard({
  tool,
  scope,
  args,
  confirmText,
  onApprove,
  onEdit,
  onDecline,
  status,
  result,
  onReview,
}: ToolUseCardProps) {
  const [approved, setApproved] = useState(false);

  // Live mode = the streaming path drives status; the approval buttons are
  // suppressed and the header/footer reflect run state instead.
  const isLive = status !== undefined;

  const handleApprove = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setApproved(true);
    onApprove?.();
  };

  const subtitle = isLive
    ? status === 'running'
      ? 'Running…'
      : status === 'error'
        ? 'Failed'
        : status === 'pending'
          ? 'Awaiting approval'
          : 'Completed'
    : approved
      ? 'Approved · running'
      : `Awaiting approval · scope: ${scope}`;

  return (
    <View
      style={{
        marginLeft: 36 + 14, // align past the avatar gutter
        marginRight: 14,
        marginBottom: 10,
        backgroundColor: T.bgCard,
        borderWidth: 1,
        borderColor: T.aiBorder,
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: T.ai,
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: T.aiTint,
          borderBottomWidth: 1,
          borderBottomColor: T.aiBorder,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MIcon name="bolt" size={13} color="white" fill={1} />
          </LinearGradient>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.1,
            }}
            numberOfLines={1}
          >
            {tool}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: isLive && status === 'error' ? T.iosRed : T.aiDark,
              fontWeight: '500',
            }}
          >
            {subtitle}
          </Text>
        </View>
        {isLive ? (
          status === 'running' ? (
            <ActivityIndicator size="small" color={T.aiDark} />
          ) : status === 'error' ? (
            <MIcon name="error" size={18} color={T.iosRed} fill={1} />
          ) : status === 'pending' ? (
            <MIcon name="pending-actions" size={18} color={T.aiDark} fill={1} />
          ) : (
            <MIcon name="check-circle" size={18} color={T.success} fill={1} />
          )
        ) : (
          <MIcon name="expand-less" size={18} color={T.textTertiary} />
        )}
      </View>

      {/* Args */}
      <View style={{ padding: 12 }}>
        {args.map(([k, v]) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                color: T.textTertiary,
                width: 72,
                fontFamily: MONO,
                fontSize: 12,
              }}
            >
              {k}
            </Text>
            <Text
              style={{
                color: T.textPrimary,
                fontWeight: '500',
                flex: 1,
                fontSize: 12,
              }}
              numberOfLines={1}
            >
              {v}
            </Text>
          </View>
        ))}
      </View>

      {/* Footer: live run status, or approval confirmation / buttons */}
      {isLive ? (
        status === 'running' ? null : status === 'pending' ? (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: T.borderLight,
              backgroundColor: T.aiTint,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <MIcon name="schedule" size={14} color={T.aiDark} fill={1} />
            <Text style={{ flex: 1, fontSize: 12, color: T.aiDark, fontWeight: '600' }}>
              {result ?? 'Queued for approval'}
            </Text>
            {onReview ? (
              <Pressable
                accessibilityLabel="Review in Approvals"
                onPress={onReview}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Text style={{ fontSize: 12, color: T.ai, fontWeight: '700' }}>Review</Text>
                <MIcon name="chevron-right" size={16} color={T.ai} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: T.borderLight,
              backgroundColor: status === 'error' ? T.bgSubtle : T.aiTint,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <MIcon
              name={status === 'error' ? 'error' : 'check-circle'}
              size={14}
              color={status === 'error' ? T.iosRed : T.success}
              fill={1}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 12,
                color: status === 'error' ? T.iosRed : T.aiDark,
                fontWeight: '600',
              }}
              numberOfLines={3}
            >
              {result ?? (status === 'error' ? 'Tool failed' : 'Done')}
            </Text>
          </View>
        )
      ) : approved ? (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: T.borderLight,
            backgroundColor: T.aiTint,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <MIcon name="check-circle" size={14} color={T.success} fill={1} />
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: T.aiDark,
              fontWeight: '600',
            }}
          >
            {confirmText ?? 'Sent for processing'}
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: T.borderLight,
          }}
        >
          <Pressable
            accessibilityLabel="Approve tool action"
            onPress={handleApprove}
            style={{
              flex: 1,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              {...linearGradientProps(Gradients.ai)}
              style={{
                paddingVertical: 8,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
            >
              <MIcon name="check" size={14} color="white" />
              <Text
                style={{
                  color: 'white',
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 0.1,
                }}
              >
                Approve
              </Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            accessibilityLabel="Edit tool action before approving"
            onPress={onEdit}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: T.border,
            }}
          >
            <Text
              style={{
                color: T.textPrimary,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              Edit
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Decline tool action"
            onPress={onDecline}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: T.border,
            }}
          >
            <Text
              style={{
                color: T.textSecondary,
                fontSize: 12,
                fontWeight: '500',
              }}
            >
              Decline
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default ToolUseCard;
