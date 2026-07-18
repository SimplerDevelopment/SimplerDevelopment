import { Text, View } from 'react-native';

import { T } from '@/lib/theme';
import { IconTile } from '@/components/atoms';
import { Card } from './Card';
import { LargeTitle } from './LargeTitle';
import { Screen } from './Screen';

export type PlaceholderProps = {
  title: string;
  /** Icon shown above the description. */
  icon?: string;
  iconBg?: string;
  description?: string;
  /** Defaults to "Coming in Phase 2". */
  message?: string;
};

/**
 * Minimal placeholder used across the navigation skeleton. Proves that the
 * design system + routing work end-to-end without committing to the per-screen
 * detail that Phase 2 will build.
 */
export function Placeholder({
  title,
  icon = 'construction',
  iconBg = T.ai,
  description,
  message = 'Coming in Phase 2',
}: PlaceholderProps) {
  return (
    <Screen>
      <LargeTitle title={title} subtitle={description} />
      <Card>
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <IconTile name={icon} bg={iconBg} size={48} iconSize={26} />
          <Text
            style={{
              marginTop: 16,
              fontSize: 17,
              fontWeight: '600',
              color: T.textPrimary,
            }}
          >
            {message}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              color: T.textSecondary,
              textAlign: 'center',
              paddingHorizontal: 12,
            }}
          >
            The {title.toLowerCase()} screen is scaffolded — Phase 2 will fill
            in the interactions.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

export default Placeholder;
