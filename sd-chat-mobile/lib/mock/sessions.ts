/**
 * Mock active-sessions data for Privacy & Security settings (mockup screen 05).
 *
 * Phase 3 will swap this for a real `/api/sessions` fetch via Tanstack Query —
 * shape kept close to the eventual server response.
 */

export type SessionIcon = 'phone_iphone' | 'laptop_mac' | 'language';

export type Session = {
  id: string;
  device: string;
  location: string;
  /** Human-readable timestamp ("Now · this device", "2 hours ago", …). */
  time: string;
  icon: SessionIcon;
  /** True for the device the user is currently on; cannot be revoked from here. */
  current?: boolean;
};

export const sessions: Session[] = [
  {
    id: 's_current',
    device: 'iPhone 15 Pro',
    location: 'Brooklyn, NY',
    time: 'Now · this device',
    icon: 'phone_iphone',
    current: true,
  },
  {
    id: 's_macbook',
    device: 'MacBook Pro',
    location: 'Brooklyn, NY',
    time: '2 hours ago',
    icon: 'laptop_mac',
  },
  {
    id: 's_chrome',
    device: 'Chrome · macOS',
    location: 'Manhattan, NY',
    time: 'Yesterday',
    icon: 'language',
  },
];
