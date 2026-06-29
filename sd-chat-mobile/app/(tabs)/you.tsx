import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar, MIcon, SdLogo } from '@/components/atoms';
import { Group, GroupLabel, SettingsRow } from '@/components/settings';
import { LargeTitle, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/lib/api/user';
import { currentUser as mockUser } from '@/lib/mock';
import { Gradients, T } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { linearGradientProps } from '@/lib/theme';

/**
 * "You" tab — Settings root (settings mockup screen 01).
 *
 * Layout: profile card → grouped sections (Workspace · AI · App · Integrations
 * · Support) → app version footer. Every row that links to a subscreen calls
 * router.push('/settings/<slug>').
 *
 * Identity layer (Phase 4 Agent C):
 *  - Profile card binds to `useAuth().user` (sourced from `/api/portal/me`
 *    via Tanstack Query — see `lib/api/user.ts`).
 *  - "Workspaces" row count comes from `useWorkspaces()`.
 *  - Mock user is kept as a boot-time fallback for the rare case where the
 *    auth hook has neither cached nor live data (e.g. brand-new install
 *    with the network down mid-bridge).
 *  - Sign-out row at the bottom calls `useAuth().signOut`.
 *
 * Other inline value strings ("Push on", "Face ID", "Indigo") still
 * hard-coded — those are owned by future settings sub-screens (Agent D
 * handles privacy/sessions).
 */
export default function YouTab() {
  const router = useRouter();
  const { user, client, signOut } = useAuth();
  const workspacesQuery = useWorkspaces({ enabled: !!user });

  // Profile fallback — auth user wins, mock fills the rare hole.
  const displayName = user?.name?.trim() || mockUser.name;
  const displayEmail = user?.email?.trim() || mockUser.email;
  const displayRole = (user?.role ?? 'member').toUpperCase();
  const activeWorkspaceName = client?.company?.trim() || 'No workspace';

  const workspaceCount =
    workspacesQuery.data?.clients.length ??
    (workspacesQuery.isLoading ? null : null);
  const workspaceCountLabel =
    workspaceCount === null
      ? workspacesQuery.isError
        ? 'Tap to retry'
        : '...'
      : String(workspaceCount);

  return (
    <Screen>
      <LargeTitle
        title="Settings"
        right={
          <Pressable
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: T.bgCard,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel="Search settings"
            accessibilityRole="button"
          >
            <MIcon name="search" size={18} color={T.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Profile card */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: T.bgCard,
            borderRadius: 14,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Avatar id={user?.id ?? mockUser.avatarId} name={displayName} size={58} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 17, fontWeight: '600', color: T.textPrimary, letterSpacing: -0.2 }}
            >
              {displayName}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}
            >
              {displayEmail}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 5,
                marginTop: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
                backgroundColor: T.aiSoft,
                borderRadius: 999,
                maxWidth: '100%',
              }}
            >
              <LinearGradient
                {...linearGradientProps(Gradients.ai)}
                style={{ width: 6, height: 6, borderRadius: 3 }}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: T.aiDark,
                  letterSpacing: 0.2,
                  flexShrink: 1,
                }}
              >
                {activeWorkspaceName.toUpperCase()} · {displayRole}
              </Text>
            </View>
          </View>
          <MIcon name="chevron_right" size={20} color={T.textTertiary} />
        </View>

        <GroupLabel mt={16}>Workspace</GroupLabel>
        <Group>
          <SettingsRow
            icon="apartment"
            iconGradient={Gradients.ai}
            iconFill={1}
            title="Workspaces"
            value={workspaceCountLabel}
            onPress={() => router.push('/settings/workspaces')}
          />
          <SettingsRow
            icon="group"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Members"
          />
          <SettingsRow
            icon="link"
            iconBg={T.iosTeal}
            iconFill={1}
            title="Invitations"
            last
          />
        </Group>

        <GroupLabel>AI</GroupLabel>
        <Group>
          <SettingsRow
            icon="auto_awesome"
            iconGradient={Gradients.ai}
            iconFill={1}
            title="AI Assistant"
            value="Approve writes"
            onPress={() => router.push('/settings/ai-assistant')}
          />
          <SettingsRow
            icon="psychology_alt"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Company Brain"
            onPress={() => router.push('/(tabs)/brain')}
          />
          <SettingsRow
            icon="bolt"
            iconBg={T.iosYellow}
            iconFill={1}
            title="Credits & usage"
            last
          />
        </Group>

        <GroupLabel>App</GroupLabel>
        <Group>
          <SettingsRow
            icon="notifications"
            iconBg={T.iosRed}
            iconFill={1}
            title="Notifications"
            value="Push on"
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            icon="palette"
            iconBg={T.iosOrange}
            iconFill={1}
            title="Appearance"
            value="System · Indigo"
            onPress={() => router.push('/settings/appearance')}
          />
          <SettingsRow
            icon="lock"
            iconBg={T.success}
            iconFill={1}
            title="Privacy & Security"
            value="Face ID"
            onPress={() => router.push('/settings/privacy')}
          />
          <SettingsRow
            icon="language"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Language & Region"
            value="English (US)"
            last
          />
        </Group>

        <GroupLabel>Integrations</GroupLabel>
        <Group>
          <SettingsRow
            icon="cloud_done"
            iconBg={T.iosBlue}
            iconFill={1}
            title="Google Workspace"
            value="Connected"
            valueColor={T.success}
          />
          <SettingsRow
            icon="payments"
            iconBg={T.iosPurple}
            iconFill={1}
            title="Stripe Billing"
          />
          <SettingsRow
            icon="event"
            iconBg={T.iosOrange}
            iconFill={1}
            title="Calendar sync"
            value="On"
            last
          />
        </Group>

        <GroupLabel>Support</GroupLabel>
        <Group>
          <SettingsRow icon="help" iconBg={T.textTertiary} iconFill={1} title="Help center" />
          <SettingsRow
            icon="feedback"
            iconBg={T.iosTeal}
            iconFill={1}
            title="Send feedback"
          />
          <SettingsRow
            icon="logout"
            iconBg={T.iosRed}
            iconFill={1}
            title="Sign out"
            titleColor={T.iosRed}
            accessory={null}
            last
            onPress={() => {
              void (async () => {
                await signOut();
                router.replace('/(auth)/sign-in');
              })();
            }}
          />
        </Group>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 24,
          }}
        >
          <SdLogo size={12} color={T.textTertiary} />
          <Text
            style={{
              fontSize: 11,
              color: T.textTertiary,
              fontWeight: '500',
              letterSpacing: 0.3,
            }}
          >
            Simpler Development Chat · 1.0.0 (build 247)
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
