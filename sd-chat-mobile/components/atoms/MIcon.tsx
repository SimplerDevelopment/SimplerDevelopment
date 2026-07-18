import { MaterialIcons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';

import { T } from '@/lib/theme';

/**
 * MIcon — the canonical icon atom.
 *
 * The web mockups use Material Symbols Outlined via the variable font. RN has
 * no first-class Material Symbols package, so we use MaterialIcons from
 * @expo/vector-icons. Most names are identical (search, settings, chat, etc.).
 *
 * Name mapping (Material Symbols → MaterialIcons):
 *   auto_awesome    → auto-awesome           (sparkle / AI accent)
 *   psychology_alt  → psychology              (closest brain icon; alt variant doesn't exist)
 *   hub             → hub                     (same)
 *   perm_media      → perm-media              (same, hyphenated)
 *   chevron_right   → chevron-right
 *   chevron_left    → chevron-left
 *   account_circle  → account-circle
 *
 * The `fill` prop is preserved for API parity with the mockup but is a no-op
 * for MaterialIcons (the variable-font fill axis is web-only). Use the icon
 * name's filled variant via MaterialCommunityIcons in Phase 2 if needed.
 */
export type MIconProps = {
  name: ComponentProps<typeof MaterialIcons>['name'] | string;
  size?: number;
  /** Accepts any RN ColorValue so it can take react-navigation tab-bar tint values. */
  color?: ComponentProps<typeof MaterialIcons>['color'];
  /** Mirrors the variable-font FILL axis; currently informational on native. */
  fill?: 0 | 1;
};

// Symbol → MaterialIcons translation table. Keys are Material Symbols names
// (snake_case) used in the mockups; values are the @expo/vector-icons name.
// Anything not in this table is passed through as-is — most Material Symbols
// names happen to match MaterialIcons.
const SYMBOL_TO_MATERIAL: Record<string, ComponentProps<typeof MaterialIcons>['name']> = {
  auto_awesome: 'auto-awesome',
  psychology_alt: 'psychology',
  perm_media: 'perm-media',
  chevron_right: 'chevron-right',
  chevron_left: 'chevron-left',
  account_circle: 'account-circle',
  arrow_back: 'arrow-back',
  arrow_forward: 'arrow-forward',
  more_horiz: 'more-horiz',
  more_vert: 'more-vert',
  check_circle: 'check-circle',
  radio_button_unchecked: 'radio-button-unchecked',
  push_pin: 'push-pin',
  format_quote: 'format-quote',
  attach_file: 'attach-file',
  alternate_email: 'alternate-email',
  graphic_eq: 'graphic-eq',
  // Brain + media additions (Phase 2 B)
  filter_list: 'filter-list',
  expand_more: 'expand-more',
  play_arrow: 'play-arrow',
  grid_view: 'grid-view',
  view_list: 'view-list',
  menu_book: 'menu-book',
  event_note: 'event-note',
  north_east: 'north-east',
  check_box: 'check-box',
  check_box_outline_blank: 'check-box-outline-blank',
  trending_up: 'trending-up',
  trending_down: 'trending-down',
  view_kanban: 'view-kanban',
  corporate_fare: 'corporate-fare',
  rocket_launch: 'rocket-launch',
  chat_bubble: 'chat-bubble',
  event_available: 'event-available',
  add_circle: 'add-circle',
  group_add: 'group-add',
  support_agent: 'support-agent',
  arrow_circle_up: 'arrow-circle-up',
  merge_type: 'merge-type',
  pending_actions: 'pending-actions',
  sticky_note_2: 'sticky-note-2',
  // Single-word names that match MaterialIcons exactly (kept here for clarity
  // / documentation; the pass-through default would also work)
  gavel: 'gavel',
  flag: 'flag',
  description: 'description',
  forum: 'forum',
  edit: 'edit',
  upload: 'upload',
  refresh: 'refresh',
  search: 'search',
  close: 'close',
  undo: 'undo',
  verified: 'verified',
  history: 'history',
  unpublished: 'block', // no MaterialIcons "unpublished" — closest stand-in
  mail: 'mail',
  school: 'school',
  psychology: 'psychology',
  person: 'person',
  // Onboarding / settings / approvals additions (Phase 2 C)
  business_center: 'business-center',
  edit_note: 'edit-note',
  notifications_active: 'notifications-active',
  notifications_off: 'notifications-off',
  task_alt: 'task-alt',
  ios_share: 'ios-share',
  calendar_today: 'calendar-today',
  data_object: 'data-object',
  verified_user: 'verified-user',
  visibility_off: 'visibility-off',
  cloud_sync: 'cloud-sync',
  auto_delete: 'auto-delete',
  cloud_done: 'cloud-done',
  unfold_more: 'unfold-more',
  dark_mode: 'dark-mode',
  delete_forever: 'delete-forever',
  flashlight_on: 'flashlight-on',
  photo_camera: 'photo-camera',
  phone_iphone: 'phone-iphone',
  laptop_mac: 'laptop-mac',
  auto_awesome_motion: 'auto-awesome-motion',
  apple: 'phone-iphone', // no MaterialIcons "apple" — closest brand stand-in
  bolt_outlined: 'bolt',
  auto_mode: 'autorenew', // closest MaterialIcons match
  waving_hand: 'pan-tool', // mockup uses waving_hand — not in MaterialIcons
  open_in_new: 'open-in-new',
  workspace_premium: 'workspace-premium',
  error_outline: 'error-outline',
  volume_up: 'volume-up',
  arrow_upward: 'arrow-upward',
  vpn_key: 'vpn-key',
};

export function MIcon({ name, size = 20, color, fill = 0 }: MIconProps) {
  void fill; // currently informational on native
  const mapped = (SYMBOL_TO_MATERIAL[name] ??
    name) as ComponentProps<typeof MaterialIcons>['name'];
  return <MaterialIcons name={mapped} size={size} color={color ?? T.textPrimary} />;
}

export default MIcon;
