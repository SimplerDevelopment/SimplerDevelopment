import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { OnboardingHeader } from '@/components/onboarding';
import { Screen } from '@/components/ui';
import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { PrimaryCTA } from './pick-workspace';

type NotifConfig = {
  icon: string;
  color: string;
  title: string;
  gradient?: boolean;
};

const NOTIFS: NotifConfig[] = [
  { icon: 'alternate_email', color: T.ai, title: "When you're @mentioned" },
  { icon: 'forum', color: T.iosBlue, title: 'New direct messages' },
  { icon: 'auto_awesome', color: T.ai, title: 'When the AI needs your approval', gradient: true },
  { icon: 'task_alt', color: T.success, title: 'Brain updates you follow' },
];

/**
 * Notifications opt-in (onboarding mockup screen 05). Red-shielded hero bell
 * + opt-in list with electric checkmarks. The "Turn on notifications" button
 * does NOT call into expo-notifications yet — Phase 3 hooks the real
 * permission request. For now it just advances to the app.
 */
export default function NotificationsOptIn() {
  const router = useRouter();
  const finish = () => router.replace('/(tabs)');

  return (
    <Screen>
      <OnboardingHeader total={5} current={3} onBack={() => router.back()} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        {/* Hero illustration */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ position: 'relative', marginBottom: 22 }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 22,
                backgroundColor: T.iosRed,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: T.iosRed,
                shadowOpacity: 0.35,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 18 },
              }}
            >
              <MIcon name="notifications_active" size={44} color="white" fill={1} />
            </View>
            <View
              style={{
                position: 'absolute',
                top: -6,
                right: -10,
                minWidth: 26,
                height: 26,
                paddingHorizontal: 7,
                borderRadius: 13,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: 'white',
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Text style={{ color: T.danger, fontSize: 13, fontWeight: '800', letterSpacing: -0.3 }}>
                3
              </Text>
            </View>
          </View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.5,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            Stay in the loop
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: T.textSecondary,
              lineHeight: 21,
              maxWidth: 290,
              textAlign: 'center',
            }}
          >
            We'll only ping you for things that matter — and you can fine-tune what counts.
          </Text>
        </View>

        {/* Notif list */}
        <View
          style={{
            backgroundColor: T.bgCard,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: T.borderLight,
            marginBottom: 14,
          }}
        >
          {NOTIFS.map((n, i) => (
            <View
              key={n.title}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
                borderBottomWidth: i === NOTIFS.length - 1 ? 0 : 0.5,
                borderBottomColor: T.borderLight,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: n.gradient ? undefined : n.color + '18',
                }}
              >
                {n.gradient ? (
                  <LinearGradient
                    {...linearGradientProps(Gradients.ai)}
                    style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <MIcon name={n.icon} size={16} color="white" fill={1} />
                  </LinearGradient>
                ) : (
                  <MIcon name={n.icon} size={16} color={n.color} fill={1} />
                )}
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: T.textPrimary, fontWeight: '500' }}>
                {n.title}
              </Text>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: T.aiSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="check" size={11} color={T.ai} />
              </View>
            </View>
          ))}
        </View>

        {/* Quiet-hours footnote */}
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: T.bgCard,
            borderWidth: 1,
            borderColor: T.borderLight,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <MIcon name="dark_mode" size={16} color={T.textTertiary} />
          <Text style={{ flex: 1, fontSize: 12, color: T.textTertiary, lineHeight: 17 }}>
            Quiet hours default to{' '}
            <Text style={{ color: T.textSecondary, fontWeight: '600' }}>10:00 PM – 7:00 AM</Text>. Adjust in Settings.
          </Text>
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 20,
          borderTopWidth: 1,
          borderTopColor: T.borderLight,
          gap: 8,
        }}
      >
        <PrimaryCTA
          icon="notifications_active"
          label="Turn on notifications"
          onPress={finish}
        />
        <Pressable
          onPress={finish}
          style={({ pressed }) => ({
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: T.textSecondary, fontSize: 13, fontWeight: '500' }}>
            Maybe later
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
