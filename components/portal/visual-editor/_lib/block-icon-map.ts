// Map block.type to its Material Icons name. Sourced from the registry so
// custom-component manifests register their own icons through the same path.
import { BUILT_IN_BLOCK_TYPES } from '@/lib/blocks/registry';

export const BLOCK_ICON_MAP: Record<string, string> = {};
for (const bt of BUILT_IN_BLOCK_TYPES) BLOCK_ICON_MAP[bt.type] = bt.icon;
