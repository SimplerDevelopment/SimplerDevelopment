import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiAvatar, MIcon } from '@/components/atoms';
import { useAuth } from '@/hooks/useAuth';
import { AuthError } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Sign-in — native credentials form.
 *
 * Replaces the original in-app-browser bridge. POSTs `{ email, password }`
 * to `/api/portal/auth/mobile-sign-in` via `useAuth().signInWithCredentials`.
 * On success: token is persisted, `(tabs)` is the next stop — NO onboarding
 * chain (pick-workspace / meet-assistant / etc. are no longer auto-routed).
 *
 * On 401 (bad credentials), 403 (no workspace), or network error, an inline
 * red banner above the form explains what went wrong.
 */
export default function SignIn() {
  const router = useRouter();
  const { signInWithCredentials } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithCredentials({ email: email.trim(), password });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === 'invalid_token') {
          setError('Wrong email or password.');
        } else if (err.code === 'network') {
          setError("Couldn't reach SimplerDevelopment. Check your connection and try again.");
        } else {
          // 403 no_workspace + everything else
          setError(err.message || 'Sign-in failed. Please try again.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = () => {
    void WebBrowser.openBrowserAsync(`${api.baseUrl}/portal/forgot-password`);
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <LinearGradient
        {...linearGradientProps(Gradients.ai)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Back chevron */}
          <Pressable
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')
            }
            style={({ pressed }) => ({
              marginLeft: 16,
              marginTop: 8,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)',
              opacity: pressed ? 0.7 : 1,
            })}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MIcon name="chevron_left" size={22} color="white" />
          </Pressable>

          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingBottom: 24,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Compact hero */}
            <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 28 }}>
              <View
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 12 },
                }}
              >
                <AiAvatar size={64} ring logo />
              </View>
              <Text
                style={{
                  marginTop: 18,
                  fontSize: 26,
                  fontWeight: '700',
                  color: 'white',
                  letterSpacing: -0.5,
                  textAlign: 'center',
                }}
              >
                Sign in
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  lineHeight: 20,
                  color: 'rgba(255,255,255,0.85)',
                  textAlign: 'center',
                  maxWidth: 320,
                }}
              >
                Use your SimplerDevelopment portal credentials.
              </Text>
            </View>

            {/* Error banner */}
            {error ? (
              <View
                style={{
                  marginBottom: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: 'rgba(220, 38, 38, 0.92)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
                accessibilityLiveRegion="polite"
              >
                <MIcon name="error_outline" size={18} color="white" />
                <Text
                  style={{ color: 'white', fontSize: 13, fontWeight: '500', flex: 1 }}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Email field */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  marginLeft: 4,
                }}
              >
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.55)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!busy}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  color: 'white',
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.22)',
                }}
              />
            </View>

            {/* Password field */}
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  marginLeft: 4,
                }}
              >
                Password
              </Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                  editable={!busy}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    paddingRight: 48,
                    color: 'white',
                    fontSize: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                  }}
                />
                <Pressable
                  onPress={() => setShowPassword(s => !s)}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    right: 8,
                    top: 0,
                    bottom: 0,
                    width: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <MIcon
                    name={showPassword ? 'visibility_off' : 'visibility'}
                    size={20}
                    color="rgba(255,255,255,0.85)"
                  />
                </Pressable>
              </View>
            </View>

            {/* Forgot password */}
            <Pressable
              onPress={handleForgotPassword}
              style={({ pressed }) => ({
                alignSelf: 'flex-end',
                marginBottom: 20,
                paddingVertical: 6,
                paddingHorizontal: 4,
                opacity: pressed ? 0.6 : 1,
              })}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                  fontWeight: '500',
                  textDecorationLine: 'underline',
                }}
              >
                Forgot password?
              </Text>
            </Pressable>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: 'white',
                paddingVertical: 16,
                paddingHorizontal: 22,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
                shadowColor: '#000',
                shadowOpacity: 0.22,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
              })}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: !canSubmit, busy }}
            >
              {busy ? (
                <>
                  <ActivityIndicator size="small" color={T.ai} />
                  <Text
                    style={{ color: T.textPrimary, fontSize: 16, fontWeight: '600' }}
                  >
                    Signing in…
                  </Text>
                </>
              ) : (
                <>
                  <MIcon name="lock" size={18} color={T.ai} />
                  <Text
                    style={{ color: T.textPrimary, fontSize: 16, fontWeight: '600' }}
                  >
                    Sign in
                  </Text>
                </>
              )}
            </Pressable>

            <Text
              style={{
                marginTop: 18,
                fontSize: 12,
                color: 'rgba(255,255,255,0.8)',
                textAlign: 'center',
                lineHeight: 18,
              }}
            >
              By continuing you agree to the SimplerDevelopment{' '}
              <Text style={{ textDecorationLine: 'underline' }}>Terms of Service</Text> and{' '}
              <Text style={{ textDecorationLine: 'underline' }}>Privacy Policy</Text>.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
