import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { MIcon } from '@/components/atoms';
import { T } from '@/lib/theme';

/**
 * Bottom-tab navigator. AI accent on the active tab matches the mockup.
 * Label/icon mapping mirrors `TabBar` in sd-chat-settings-mockup.html.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.ai,
        tabBarInactiveTintColor: T.textTertiary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopColor: T.rowDivider,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => (
            <MIcon name="forum" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="brain"
        options={{
          title: 'Brain',
          tabBarIcon: ({ color, size }) => (
            <MIcon name="psychology_alt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="media"
        options={{
          title: 'Media',
          tabBarIcon: ({ color, size }) => (
            <MIcon name="perm_media" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => (
            <MIcon name="account_circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
