import { View } from 'react-native';

import { T } from '@/lib/theme';
import { MIcon } from './MIcon';

export type RadioProps = {
  selected: boolean;
  accent?: string;
};

export function Radio({ selected, accent = T.ai }: RadioProps) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: selected ? 0 : 1.5,
        borderColor: T.border,
        backgroundColor: selected ? accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? <MIcon name="check" size={14} color="white" /> : null}
    </View>
  );
}

export default Radio;
