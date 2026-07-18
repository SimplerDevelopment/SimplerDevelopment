import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';

import { MIcon } from '@/components/atoms';
import { T } from '@/lib/theme';

/**
 * Generic bottom-sheet action menu used by the brain detail screens
 * (note / decision / glossary / person). Caller passes a list of `Action`s
 * and the sheet renders one row per action, plus a Cancel row at the bottom.
 *
 * Two safety affordances are built in:
 *   - `destructive: true` styles the row red and (by default) makes the FIRST
 *     tap arm the action, the SECOND tap fire it. Set `instant: true` to opt
 *     out of the arm-step.
 *   - `loading` on an action shows a spinner and disables the row while the
 *     parent mutation runs.
 *
 * Tap state for "tap again to confirm" is per-row and resets whenever the
 * sheet closes (so re-opening starts clean).
 *
 * Patterned after the existing AttachSheet (bottom slide-up, dimmed backdrop,
 * grabber). Not Modal-of-modals — parent must guard against opening this
 * over another modal.
 */

export type Action = {
  id: string;
  label: string;
  /** Material Symbols snake_case (e.g. `ios_share`, `open_in_new`, `delete`). */
  icon: string;
  /** Tint the row red. Also enables the two-tap confirm flow unless
   *  `instant: true` is also set. */
  destructive?: boolean;
  /** Skip the two-tap arm step on destructive rows. */
  instant?: boolean;
  /** Show a spinner instead of the chevron. The parent owns the mutation
   *  state — pass `true` while it's in flight. */
  loading?: boolean;
  /** Disable the row without showing a spinner. */
  disabled?: boolean;
  /** Optional accessibility override; falls back to `label`. */
  accessibilityLabel?: string;
  onPress: () => void | Promise<void>;
};

export type ActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Optional eyebrow text rendered above the actions (e.g. the entity title
   *  the actions apply to). One line, truncates. */
  title?: string;
  actions: Action[];
};

export function ActionsSheet({
  visible,
  onClose,
  title,
  actions,
}: ActionsSheetProps) {
  // Per-action "armed for confirm" state. Keyed by action.id so each row's
  // arm step is independent.
  const [armed, setArmed] = useState<Record<string, boolean>>({});

  const handleClose = () => {
    setArmed({});
    onClose();
  };

  const handlePress = async (a: Action) => {
    if (a.loading || a.disabled) return;
    if (a.destructive && !a.instant && !armed[a.id]) {
      setArmed((m) => ({ ...m, [a.id]: true }));
      return;
    }
    try {
      await a.onPress();
    } catch (err) {
      console.warn('[actions-sheet] action failed', a.id, err);
    }
    // Note: caller is responsible for closing the sheet via `onClose` if the
    // action completed successfully. For destructive flows we leave it open
    // on throw so the user can retry.
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <Pressable
        onPress={handleClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(11,15,25,0.4)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          // Inner press-blocker so taps on the sheet body don't dismiss it.
          onPress={() => {}}
          style={{
            backgroundColor: T.bgCard,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingTop: 8,
            paddingBottom: 32,
          }}
        >
          {/* Grabber */}
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: T.bgChip,
              marginBottom: 12,
            }}
          />

          {title ? (
            <Text
              numberOfLines={1}
              style={{
                paddingHorizontal: 20,
                fontSize: 13,
                color: T.textTertiary,
                fontWeight: '600',
                marginBottom: 4,
              }}
            >
              {title}
            </Text>
          ) : null}

          {actions.map((a) => (
            <ActionRow
              key={a.id}
              action={a}
              armed={!!armed[a.id]}
              onPress={() => handlePress(a)}
            />
          ))}

          <View style={{ height: 8 }} />
          <ActionRow
            action={{
              id: '__cancel__',
              icon: 'close',
              label: 'Cancel',
              onPress: handleClose,
            }}
            armed={false}
            onPress={handleClose}
            muted
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({
  action,
  armed,
  onPress,
  muted,
}: {
  action: Action;
  armed: boolean;
  onPress: () => void;
  muted?: boolean;
}) {
  const color = action.destructive
    ? T.danger
    : muted
      ? T.textSecondary
      : T.textPrimary;
  const label =
    action.destructive && !action.instant && armed
      ? `Tap again to ${action.label.toLowerCase()}`
      : action.label;
  return (
    <Pressable
      accessibilityLabel={
        action.accessibilityLabel ?? (armed ? `Confirm ${action.label}` : action.label)
      }
      onPress={onPress}
      disabled={action.loading || action.disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 20,
        backgroundColor: pressed ? T.bgChip : 'transparent',
        opacity: action.loading || action.disabled ? 0.6 : 1,
      })}
    >
      <MIcon name={action.icon} size={20} color={color} />
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          color,
          fontWeight: action.destructive ? '600' : '500',
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      {action.loading ? <ActivityIndicator size="small" color={color} /> : null}
    </Pressable>
  );
}

export default ActionsSheet;
