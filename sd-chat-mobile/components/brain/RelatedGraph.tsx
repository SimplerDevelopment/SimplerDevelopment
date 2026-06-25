import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Gradients, T, linearGradientProps } from '@/lib/theme';

export type RelatedGraphProps = {
  /** Term shown in the center "AI"-gradient chip. */
  term: string;
  /**
   * Up to 4 satellite terms placed at the four corners of the card. Excess
   * entries are dropped to keep the visual recognizable.
   */
  satellites: string[];
  /** Card height — default mirrors the mockup (168px). */
  height?: number;
};

// Anchor positions for the 4 satellite chips. Order matches the mockup:
// top-left, top-right, bottom-left, bottom-right.
const POSITIONS: Array<{ x: number; y: number }> = [
  { x: 0.18, y: 0.24 },
  { x: 0.82, y: 0.24 },
  { x: 0.18, y: 0.78 },
  { x: 0.82, y: 0.78 },
];

/**
 * Small "related terms" graph for the glossary detail screen — center node is
 * the term, 4 satellite chips are connected by thin lines.
 */
export function RelatedGraph({ term, satellites, height = 168 }: RelatedGraphProps) {
  const items = satellites.slice(0, 4);

  return (
    <View
      style={{
        marginHorizontal: 16,
        backgroundColor: T.bgCard,
        borderRadius: 14,
        padding: 12,
        height,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* SVG connectors. Pointer events are off so the chips remain pressable
          if we wire taps later. */}
      <Svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0 }}
        pointerEvents="none"
      >
        {items.map((_, i) => {
          const p = POSITIONS[i];
          if (!p) return null;
          return (
            <Line
              key={i}
              x1="50%"
              y1="50%"
              x2={`${p.x * 100}%`}
              y2={`${p.y * 100}%`}
              stroke={T.aiBorder}
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>

      {/* Center chip — AI gradient. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            borderRadius: 999,
            overflow: 'hidden',
            shadowColor: T.ai,
            shadowOpacity: 0.4,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <LinearGradient
            {...linearGradientProps(Gradients.ai)}
            style={{ paddingVertical: 8, paddingHorizontal: 16 }}
          >
            <Text
              style={{
                color: 'white',
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: -0.1,
              }}
            >
              {term}
            </Text>
          </LinearGradient>
        </View>
      </View>

      {/* Satellite chips */}
      {items.map((s, i) => {
        const p = POSITIONS[i];
        if (!p) return null;
        return (
          <View
            key={s + i}
            style={{
              position: 'absolute',
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              transform: [{ translateX: -40 }, { translateY: -12 }],
              backgroundColor: T.bgCard,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: T.aiBorder,
              paddingHorizontal: 10,
              paddingVertical: 5,
              minWidth: 80,
              alignItems: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: T.textPrimary,
              }}
            >
              {s}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default RelatedGraph;
