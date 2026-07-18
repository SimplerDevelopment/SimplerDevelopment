import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { T } from '@/lib/theme';

/**
 * Root gate.
 *
 *   - While `useAuth().isLoading` (token hydration + /api/portal/me probe in
 *     flight), show a centered spinner so we don't flicker between screens.
 *   - Authenticated → `(tabs)`.
 *   - Unauthenticated → `(auth)/welcome` (Agent C's onboarding entry).
 *     `welcome` itself is responsible for routing to `(auth)/sign-in` when
 *     the user taps "Continue with …".
 */
export default function Index() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: T.bgApp,
        }}
      >
        <ActivityIndicator size="small" color={T.ai} />
      </View>
    );
  }

  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/welcome" />;
}
