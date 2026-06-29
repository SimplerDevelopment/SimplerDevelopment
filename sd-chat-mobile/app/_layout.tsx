import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { queryClient } from '@/lib/api/query-client';
import { AuthProvider } from '@/lib/auth/AuthContext';
import '../global.css';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  // The root `index.tsx` decides whether to redirect to (tabs) or (auth),
  // based on the auth state hydrated by AuthProvider.
  initialRouteName: 'index',
};

export default function RootLayout() {
  // Auth hydration moved into AuthProvider (which also validates the token
  // against /api/portal/me and registers the 401 handler).
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen
            name="chat/[id]"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen name="brain/note/[id]" />
          <Stack.Screen name="brain/decision/[id]" />
          <Stack.Screen name="brain/person/[id]" />
          <Stack.Screen name="brain/glossary/[term]" />
          <Stack.Screen name="approvals/index" />
          <Stack.Screen name="approvals/[id]" />
          <Stack.Screen name="approvals/bulk" />
          <Stack.Screen name="approvals/history" />
          <Stack.Screen name="approvals/audit" />
          <Stack.Screen name="settings/workspaces" />
          <Stack.Screen name="settings/ai-assistant" />
          <Stack.Screen name="settings/notifications" />
          <Stack.Screen name="settings/privacy" />
          <Stack.Screen name="settings/appearance" />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
