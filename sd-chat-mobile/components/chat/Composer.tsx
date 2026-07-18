import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';

import { MIcon } from '@/components/atoms';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

import { AttachSheet } from './AttachSheet';
import { MentionPicker } from './MentionPicker';
import { SlashMenu } from './SlashMenu';

export type ComposerMode = 'ai-1on1' | 'group-open' | 'group-direct-to-ai';

export type ComposerProps = {
  /**
   * - ai-1on1: no toggle, AI gradient send button, AI hint icon
   * - group-open: shows direct-to-AI toggle in OFF state, brand send button
   * - group-direct-to-ai: toggle ON, electric border + AI tint, AI gradient send
   */
  mode: ComposerMode;
  /** Group title shown in the meta line, e.g. "Atlas Launch". */
  groupTitle?: string;
  /** Number of human members (for the meta string). */
  memberCount?: number;
  /** Whether to render the toggle at all. Defaults to true for group modes. */
  showDirectToAiToggle?: boolean;
  onChangeMode?: (next: ComposerMode) => void;
  /**
   * Called with the trimmed text when the user taps send / hits return.
   * The composer clears its own input regardless. Phase 3+: wired by the
   * AI chat screen to dispatch a real `streamChat` call.
   */
  onSubmit?: (text: string) => void;
  /**
   * When true, disables the send/mic affordances (e.g. while a stream is
   * in-flight). The visual state is unchanged — just non-interactive.
   */
  disabled?: boolean;
  /**
   * Seed the composer with pre-filled text. Used by deep-links like
   * "Ask the assistant about this note" that route to /chat/new with a
   * starter prompt — the user can edit or send as-is.
   */
  initialDraft?: string;
};

/**
 * The bottom composer. Three visual variants per ComposerMode.
 *
 * Behaviors wired in Phase 2:
 *  - `/` as first char → SlashMenu opens
 *  - `@` mid-string → MentionPicker opens
 *  - Mic → push /chat/voice
 *  - Plus → AttachSheet opens
 *  - Direct-to-AI toggle (group modes) → flips mode locally via onChangeMode
 *
 * No real sending — submit just clears the input.
 */
export function Composer({
  mode,
  groupTitle,
  memberCount = 5,
  showDirectToAiToggle = mode !== 'ai-1on1',
  onChangeMode,
  onSubmit,
  disabled = false,
  initialDraft,
}: ComposerProps) {
  const router = useRouter();
  const inputRef = useRef<TextInputType | null>(null);
  const [text, setText] = useState(initialDraft ?? '');
  const [slashOpen, setSlashOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const directToAi = mode === 'group-direct-to-ai';

  // Auto-detect `/` at first char or `@` after whitespace/start
  useEffect(() => {
    if (text === '/') {
      setSlashOpen(true);
      return;
    }
    const trimmed = text.trimEnd();
    // Open mention picker if last token starts with @ and we're not already showing the slash menu
    const lastToken = trimmed.split(/\s+/).pop() ?? '';
    if (lastToken.startsWith('@') && lastToken.length >= 1) {
      setMentionOpen(true);
    }
  }, [text]);

  const insertSlashCommand = (cmd: string) => {
    setText(`${cmd} `);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const insertMention = (handle: string) => {
    setText((prev) => {
      const m = prev.match(/^(.*?)(@\S*)?$/);
      const head = m?.[1] ?? prev;
      const handleWithoutAt = handle.startsWith('@')
        ? handle.slice(1)
        : handle.replace(/^#\s*/, '');
      // For channels, retain the '#' prefix; for ai/person/smart use '@'
      const prefix = handle.startsWith('#') ? '#' : '@';
      return `${head}${prefix}${handleWithoutAt} `;
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    onSubmit?.(trimmed);
  };

  const showMicButton = !text.trim();
  const placeholder =
    mode === 'ai-1on1'
      ? 'Message Assistant'
      : directToAi
        ? 'Message Assistant privately…'
        : `Message #${groupTitle ?? 'channel'}`;

  return (
    <View
      style={{
        backgroundColor: T.bgCard,
        borderTopWidth: 1,
        borderTopColor: T.borderLight,
      }}
    >
      {/* Direct-to-AI mode banner (only when ON) */}
      {directToAi ? (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            marginBottom: 4,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: T.aiTint,
            borderWidth: 1,
            borderColor: T.aiBorder,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <MIcon name="lock" size={14} color={T.ai} fill={1} />
          <Text
            style={{
              flex: 1,
              fontSize: 11,
              color: T.aiDark,
              fontWeight: '500',
              lineHeight: 15,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Direct to AI</Text>
            {' '}— only you will see this thread
          </Text>
          <MIcon name="info" size={14} color={T.ai} />
        </View>
      ) : null}

      {/* Mode toggle (group modes only) */}
      {showDirectToAiToggle ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingTop: 8,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: T.bgSubtle,
              borderRadius: 999,
              padding: 3,
              gap: 2,
            }}
          >
            <SegButton
              active={!directToAi}
              label="To group"
              icon="forum"
              onPress={() => onChangeMode?.('group-open')}
            />
            <SegButton
              active={directToAi}
              label="Direct to AI"
              icon="bolt"
              gradient
              onPress={() => onChangeMode?.('group-direct-to-ai')}
            />
          </View>
          <Text
            style={{ fontSize: 10, color: T.textTertiary, fontWeight: '500' }}
          >
            {directToAi
              ? 'Private · just you + AI'
              : `${memberCount} members + Assistant`}
          </Text>
        </View>
      ) : null}

      {/* Input row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 16,
        }}
      >
        <Pressable
          onPress={() => setAttachOpen(true)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: T.bgSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Attach"
          accessibilityRole="button"
        >
          <MIcon name="add" size={20} color={T.textSecondary} />
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: directToAi ? T.aiTint : T.bgSubtle,
            borderWidth: 1.5,
            borderColor: directToAi ? T.ai : 'transparent',
            borderRadius: 18,
            paddingHorizontal: 12,
            paddingVertical: 6,
            minHeight: 36,
          }}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={
              directToAi ? T.aiDark : T.textTertiary
            }
            style={{
              flex: 1,
              fontSize: 13,
              color: directToAi ? T.aiDark : T.textPrimary,
              padding: 0,
              fontWeight: directToAi ? '500' : '400',
            }}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            blurOnSubmit
          />
          {directToAi || mode === 'ai-1on1' ? (
            <MIcon
              name={mode === 'ai-1on1' ? 'bolt' : 'auto_awesome'}
              size={16}
              color={T.ai}
              fill={1}
            />
          ) : null}
        </View>

        {showMicButton ? (
          <Pressable
            onPress={() => {
              if (disabled) return;
              router.push('/chat/voice');
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              overflow: 'hidden',
              opacity: disabled ? 0.5 : 1,
            }}
            accessibilityLabel="Voice mode"
            disabled={disabled}
          >
            {mode === 'ai-1on1' || directToAi ? (
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="mic" size={18} color="white" fill={1} />
              </LinearGradient>
            ) : (
              <View
                style={{
                  flex: 1,
                  backgroundColor: T.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="mic" size={18} color="white" fill={1} />
              </View>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSubmit}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              overflow: 'hidden',
              opacity: disabled ? 0.5 : 1,
            }}
            accessibilityLabel="Send"
            disabled={disabled}
          >
            {mode === 'ai-1on1' || directToAi ? (
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="arrow-upward" size={18} color="white" />
              </LinearGradient>
            ) : (
              <View
                style={{
                  flex: 1,
                  backgroundColor: T.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="arrow-upward" size={18} color="white" />
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* Sheets */}
      <SlashMenu
        visible={slashOpen}
        onClose={() => setSlashOpen(false)}
        onPick={insertSlashCommand}
      />
      <MentionPicker
        visible={mentionOpen}
        onClose={() => setMentionOpen(false)}
        onPick={insertMention}
      />
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={(name) => {
          console.log('[composer] attach:', name);
        }}
        onPickRecent={(item) => {
          console.log('[composer] attach recent:', item.id);
        }}
      />
    </View>
  );
}

function SegButton({
  active,
  label,
  icon,
  gradient,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: string;
  gradient?: boolean;
  onPress: () => void;
}) {
  if (active && gradient) {
    return (
      <Pressable onPress={onPress} style={{ borderRadius: 999, overflow: 'hidden' }}>
        <LinearGradient
          {...linearGradientProps(Gradients.ai)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <MIcon name={icon} size={13} color="white" fill={1} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: 'white' }}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: active ? T.bgCard : 'transparent',
        shadowColor: active ? '#000' : 'transparent',
        shadowOpacity: active ? 0.08 : 0,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <MIcon
        name={icon}
        size={13}
        color={active ? T.textPrimary : T.textTertiary}
        fill={active ? 1 : 0}
      />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: active ? T.textPrimary : T.textTertiary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default Composer;
