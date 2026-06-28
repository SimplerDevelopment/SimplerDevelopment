// Icon pack resolver — replaces dynamic require('react-icons/<pack>')
// from the original CRA build. Next.js + bundlers can't follow dynamic
// requires, so we eagerly import the packs the designer actually uses
// and look up icon names from a const map.
//
// Add another pack here if a layer ever stores `iconPack: 'xx'` for one
// that isn't loaded.

import * as Fa6 from "react-icons/fa6";
import * as Bs from "react-icons/bs";
import * as Ai from "react-icons/ai";
import * as Io5 from "react-icons/io5";
import * as Rx from "react-icons/rx";
import * as Md from "react-icons/md";

import type React from "react";
type IconModule = Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>;

export const ICON_PACKS: Record<string, IconModule> = {
  fa6: Fa6 as IconModule,
  bs: Bs as IconModule,
  ai: Ai as IconModule,
  io5: Io5 as IconModule,
  // Aliases for legacy layer data
  io: Io5 as IconModule,
  rx: Rx as IconModule,
  md: Md as IconModule,
};

export function resolveIcon(pack: string | undefined, name: string | undefined) {
  if (!name) return null;
  if (pack && ICON_PACKS[pack] && ICON_PACKS[pack][name]) {
    return ICON_PACKS[pack][name];
  }
  // Fallback: scan all packs for the name (preserves prior behaviour for legacy data).
  for (const p of Object.values(ICON_PACKS)) {
    if (p[name]) return p[name];
  }
  return null;
}
