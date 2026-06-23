'use client';

import type { ComponentType, CSSProperties } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  MdRocketLaunch,
  MdAltRoute,
  MdHandshake,
  MdSchool,
  MdTrendingUp,
  MdVolunteerActivism,
  MdArrowForward,
  MdArrowBack,
  MdArrowUpward,
  MdArrowDownward,
  MdNorthEast,
  MdClose,
  MdCheck,
  MdCheckCircle,
  MdPlayCircle,
  MdInsights,
  MdSync,
  MdWorkspacePremium,
  MdStar,
  MdStorefront,
  MdInventory2,
  MdLocalOffer,
  MdErrorOutline,
  MdChevronLeft,
  MdChevronRight,
  MdOpenInNew,
  MdEdit,
  MdVisibility,
  MdHistory,
  MdMenu,
  MdArticle,
  MdSmartButton,
  MdFormatQuote,
  MdImage,
  MdImagesearchRoller,
  MdPhotoLibrary,
  MdCode,
  MdHeight,
  MdHorizontalRule,
  MdViewColumn,
  MdCropFree,
  MdTab,
  MdExpandMore,
  MdViewCarousel,
  MdSlideshow,
  MdTextRotationNone,
  MdCampaign,
  MdGridView,
  MdFlip,
  MdBarChart,
  MdRateReview,
  MdApps,
  MdLoyalty,
  MdCategory,
  MdShoppingCart,
  MdSell,
  MdSchedule,
  MdPoll,
  MdTitle,
  MdNotes,
  MdSupport,
  MdLightbulb,
  MdPeople,
  MdChat,
  MdEmail,
  MdPhone,
  MdLocationOn,
  MdSettings,
  MdInfo,
  MdWarning,
  MdDone,
  MdAdd,
  MdRemove,
  MdSearch,
  MdBookmark,
  MdFavorite,
  MdShare,
  MdDownload,
  MdUpload,
  MdRefresh,
  MdHome,
  MdBusinessCenter,
  MdDashboard,
  MdAnalytics,
  MdAutoAwesome,
  MdLink,
  MdBadge,
  MdGpsFixed,
  MdStorage,
  MdWorkspaces,
  MdMyLocation,
  MdGroup,
  MdTune,
  MdAccountTree,
  MdHub,
  MdScale,
} from 'react-icons/md';

/** Map Material Icons font names → react-icons/md components. */
const ICON_MAP: Record<string, ComponentType<IconBaseProps>> = {
  rocket_launch: MdRocketLaunch,
  conversion_path: MdAltRoute,
  alt_route: MdAltRoute,
  handshake: MdHandshake,
  school: MdSchool,
  trending_up: MdTrendingUp,
  volunteer_activism: MdVolunteerActivism,
  arrow_forward: MdArrowForward,
  arrow_back: MdArrowBack,
  arrow_upward: MdArrowUpward,
  arrow_downward: MdArrowDownward,
  north_east: MdNorthEast,
  close: MdClose,
  check: MdCheck,
  check_circle: MdCheckCircle,
  play_circle: MdPlayCircle,
  insights: MdInsights,
  sync: MdSync,
  workspace_premium: MdWorkspacePremium,
  star: MdStar,
  storefront: MdStorefront,
  inventory_2: MdInventory2,
  local_offer: MdLocalOffer,
  error_outline: MdErrorOutline,
  chevron_left: MdChevronLeft,
  chevron_right: MdChevronRight,
  open_in_new: MdOpenInNew,
  edit: MdEdit,
  visibility: MdVisibility,
  history: MdHistory,
  menu: MdMenu,
  article: MdArticle,
  smart_button: MdSmartButton,
  format_quote: MdFormatQuote,
  image: MdImage,
  photo_library: MdPhotoLibrary,
  code: MdCode,
  height: MdHeight,
  horizontal_rule: MdHorizontalRule,
  view_column: MdViewColumn,
  crop_free: MdCropFree,
  tab: MdTab,
  expand_more: MdExpandMore,
  view_carousel: MdViewCarousel,
  slideshow: MdSlideshow,
  text_rotation_none: MdTextRotationNone,
  campaign: MdCampaign,
  grid_view: MdGridView,
  flip: MdFlip,
  bar_chart: MdBarChart,
  rate_review: MdRateReview,
  apps: MdApps,
  loyalty: MdLoyalty,
  category: MdCategory,
  shopping_cart: MdShoppingCart,
  sell: MdSell,
  schedule: MdSchedule,
  poll: MdPoll,
  title: MdTitle,
  notes: MdNotes,
  support: MdSupport,
  lightbulb: MdLightbulb,
  people: MdPeople,
  chat: MdChat,
  email: MdEmail,
  phone: MdPhone,
  location_on: MdLocationOn,
  settings: MdSettings,
  info: MdInfo,
  warning: MdWarning,
  done: MdDone,
  add: MdAdd,
  remove: MdRemove,
  search: MdSearch,
  bookmark: MdBookmark,
  favorite: MdFavorite,
  share: MdShare,
  download: MdDownload,
  upload: MdUpload,
  refresh: MdRefresh,
  home: MdHome,
  business_center: MdBusinessCenter,
  dashboard: MdDashboard,
  analytics: MdAnalytics,
  auto_awesome: MdAutoAwesome,
  link: MdLink,
  badge: MdBadge,
  gps_fixed: MdGpsFixed,
  storage: MdStorage,
  workspaces: MdWorkspaces,
  my_location: MdMyLocation,
  group: MdGroup,
  tune: MdTune,
  account_tree: MdAccountTree,
  hub: MdHub,
  scale: MdScale,
};

interface IconProps {
  /** Material Icons name (e.g. "rocket_launch") or react-icons component name ("MdRocketLaunch"). */
  name: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}

/**
 * Renders a react-icons/md component for the given Material Icons name.
 * Falls back to the material-icons CSS font when a name isn't mapped,
 * so unknown icons keep working instead of rendering blank.
 */
export function Icon({ name, size, className = '', style, 'aria-hidden': ariaHidden = true }: IconProps) {
  if (!name) return null;
  const resolved = ICON_MAP[name] ?? ICON_MAP[name.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`)).replace(/^md_/, '')];

  if (resolved) {
    const C = resolved;
    const sizeStyle = size !== undefined ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined;
    return (
      <C
        className={className}
        style={{ ...sizeStyle, ...style }}
        aria-hidden={ariaHidden}
      />
    );
  }

  // Fallback: material-icons font span (keeps existing icon names working)
  const fallbackSize = size !== undefined ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined;
  return (
    <span
      className={`material-icons ${className}`}
      style={{ ...fallbackSize, ...style }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
