import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

import { MIcon, SdLogo } from '@/components/atoms';
import { api } from '@/lib/api/client';
import { Gradients, verticalGradientProps } from '@/lib/theme';

/**
 * Welcome screen (onboarding mockup screen 01).
 *
 * Full-bleed deep gradient with three faux background orbs, a centered brand
 * mark + tagline, and a single primary CTA ("Sign in") plus a secondary
 * "Sign up" link that opens the portal signup page in an external browser
 * (sign-up only happens on the web portal — no native registration flow).
 */
export default function Welcome() {
  const router = useRouter();

  const goSignIn = () => router.push('/(auth)/sign-in');

  const goSignUp = () => {
    void WebBrowser.openBrowserAsync(`${api.baseUrl}/portal/signup`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#1E3A8A' }}>
      <LinearGradient
        {...verticalGradientProps(Gradients.deep)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Soft orbs for atmospheric depth */}
      <View
        style={{
          position: 'absolute',
          top: -80,
          right: -60,
          width: 240,
          height: 240,
          borderRadius: 120,
          backgroundColor: 'rgba(255,255,255,0.10)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 200,
          left: -100,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 180,
          right: -40,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: 'rgba(255,255,255,0.05)',
        }}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 28,
            paddingTop: 24,
            paddingBottom: 16,
            justifyContent: 'space-between',
          }}
        >
          {/* Top brand pill */}
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <SdLogo size={14} color="white" />
              <Text
                style={{
                  color: 'white',
                  fontSize: 11,
                  fontWeight: '600',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                Simpler Development · Chat
              </Text>
            </View>
          </View>

          {/* Center mark + tagline */}
          <View>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.3)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 28,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
              }}
            >
              <SdLogo size={44} color="white" />
            </View>
            <Text
              style={{
                fontSize: 36,
                fontWeight: '700',
                letterSpacing: -1,
                lineHeight: 38,
                color: 'white',
                marginBottom: 14,
              }}
            >
              Your team,{'\n'}your tools,{'\n'}
              <Text style={{ opacity: 0.85 }}>one thread.</Text>
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 22,
                color: 'rgba(255,255,255,0.85)',
                maxWidth: 280,
              }}
            >
              Chat with teammates, ask the assistant, and act on your portal — all from one place.
            </Text>
          </View>

          {/* Auth CTAs */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={goSignIn}
              style={({ pressed }) => ({
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: pressed ? '#F1F2F6' : 'white',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 8 },
              })}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <MIcon name="lock" size={18} color="#1C1917" fill={1} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#1C1917' }}>
                Sign in
              </Text>
            </Pressable>

            <Pressable
              onPress={goSignUp}
              style={({ pressed }) => ({
                paddingVertical: 12,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityRole="link"
              accessibilityLabel="Create an account"
            >
              <Text
                style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '500' }}
              >
                Don&rsquo;t have an account?{' '}
                <Text style={{ textDecorationLine: 'underline', fontWeight: '600' }}>
                  Sign up
                </Text>
              </Text>
            </Pressable>

            <Text
              style={{
                color: 'rgba(255,255,255,0.55)',
                fontSize: 11,
                textAlign: 'center',
                marginTop: 4,
                lineHeight: 16,
              }}
            >
              By continuing you agree to our{'\n'}
              <Text style={{ textDecorationLine: 'underline' }}>Terms</Text> and{' '}
              <Text style={{ textDecorationLine: 'underline' }}>Privacy Policy</Text>
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
