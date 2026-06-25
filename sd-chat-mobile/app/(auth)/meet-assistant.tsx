import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { MIcon } from '@/components/atoms';
import { OnboardingHeader } from '@/components/onboarding';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { Gradients, T, linearGradientProps } from '@/lib/theme';
import { PrimaryCTA } from './pick-workspace';

type Capability = { icon: string; color: string; title: string; sub: string };

const CAPABILITIES: Capability[] = [
  { icon: 'search', color: T.ai, title: 'Search your Company Brain', sub: 'Notes, decisions, people & glossary, all in one place' },
  { icon: 'business_center', color: T.iosBlue, title: 'Update your CRM', sub: 'Create deals, log activities, move stages' },
  { icon: 'edit_note', color: T.iosOrange, title: 'Draft pages & emails', sub: 'Land as drafts in your portal, ready for review' },
  { icon: 'event_available', color: T.iosPurple, title: 'Schedule & book', sub: 'Calendar invites, booking links, follow-ups' },
];

/**
 * Meet-the-assistant screen (onboarding mockup screen 03). Gradient hero icon,
 * 4 capability rows in a single card, and a shield-tinted footnote that sets
 * up the next "permissions" screen.
 */
export default function MeetAssistant() {
  const router = useRouter();
  const { client } = useAuth();
  const workspaceName = client?.company || 'your workspace';

  return (
    <Screen>
      <OnboardingHeader
        total={5}
        current={1}
        onBack={() => router.back()}
        onSkip={() => router.replace('/(tabs)')}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ position: 'relative', marginBottom: 18 }}>
            <LinearGradient
              {...linearGradientProps(Gradients.ai)}
              style={{
                width: 88,
                height: 88,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: T.ai,
                shadowOpacity: 0.35,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 18 },
              }}
            >
              <MIcon name="auto_awesome" size={44} color="white" fill={1} />
            </LinearGradient>
            <View
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: T.success,
                borderWidth: 3,
                borderColor: 'white',
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.5,
              marginBottom: 8,
              lineHeight: 28,
              textAlign: 'center',
            }}
          >
            Meet your assistant
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: T.textSecondary,
              lineHeight: 21,
              maxWidth: 280,
              textAlign: 'center',
            }}
          >
            Powered by Claude, connected to {workspaceName === 'your workspace' ? workspaceName : `your ${workspaceName} workspace`}.
          </Text>
        </View>

        {/* Capabilities card */}
        <View
          style={{
            backgroundColor: T.bgCard,
            borderRadius: 16,
            padding: 18,
            borderWidth: 1,
            borderColor: T.borderLight,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: T.textTertiary,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontWeight: '700',
              marginBottom: 6,
            }}
          >
            It can
          </Text>
          {CAPABILITIES.map((c, i) => (
            <View
              key={c.title}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderBottomWidth: i === CAPABILITIES.length - 1 ? 0 : 0.5,
                borderBottomColor: T.borderLight,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: c.color + '18',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MIcon name={c.icon} size={18} color={c.color} fill={1} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: T.textPrimary,
                    letterSpacing: -0.1,
                  }}
                >
                  {c.title}
                </Text>
                <Text style={{ fontSize: 12, color: T.textTertiary, marginTop: 2, lineHeight: 17 }}>
                  {c.sub}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Shield footnote */}
        <View
          style={{
            marginTop: 18,
            padding: 12,
            backgroundColor: T.aiTint,
            borderWidth: 1,
            borderColor: T.aiBorder,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <MIcon name="shield" size={18} color={T.ai} fill={1} />
          <Text style={{ flex: 1, fontSize: 12, color: T.aiDark, lineHeight: 17 }}>
            <Text style={{ fontWeight: '700' }}>Always asks before writing.</Text> Reads run instantly; anything that changes data waits for your approval.
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
        }}
      >
        <PrimaryCTA
          icon="arrow_forward"
          label="Set up permissions"
          onPress={() => router.push('/(auth)/ai-permissions')}
        />
      </View>
    </Screen>
  );
}
