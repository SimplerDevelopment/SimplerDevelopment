import { View } from 'react-native';

import { T } from '@/lib/theme';

export type PageDotsProps = {
  total: number;
  /** Zero-indexed current page. */
  current: number;
};

/**
 * Progress dots used in the onboarding header. The active dot is a wider pill,
 * inactive dots are 6×6 circles — matches the onboarding mockup verbatim.
 */
export function PageDots({ total, current }: PageDotsProps) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        return (
          <View
            key={i}
            style={{
              width: active ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: active ? T.ai : '#D9DCE4',
            }}
          />
        );
      })}
    </View>
  );
}

export default PageDots;
