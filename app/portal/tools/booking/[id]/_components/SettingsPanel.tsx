/**
 * Settings tab — meeting metadata (title/description/duration), buffers,
 * advance windows, timezone, active toggle, video-conferencing choice,
 * thumbnail picker, and the danger-zone delete affordance.
 *
 * This was the largest tab in the original page — it owns all the basic
 * "what is this booking page" fields.
 */
'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import { DURATION_OPTIONS } from '../_lib/constants';

interface SettingsPanelProps {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  bufferBefore: number;
  setBufferBefore: (v: number) => void;
  bufferAfter: number;
  setBufferAfter: (v: number) => void;
  maxAdvanceDays: number;
  setMaxAdvanceDays: (v: number) => void;
  minNoticeMins: number;
  setMinNoticeMins: (v: number) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  conferenceType: string;
  setConferenceType: (v: string) => void;
  thumbnail: string;
  setThumbnail: (v: string) => void;
  deleteConfirm: boolean;
  setDeleteConfirm: (v: boolean) => void;
  onDelete: () => void;
}

const CONFERENCE_OPTIONS = [
  { value: 'none', label: 'None', icon: 'videocam_off', desc: 'No video call' },
  { value: 'google_meet', label: 'Google Meet', icon: 'video_call', desc: 'Requires Google Calendar' },
  { value: 'zoom', label: 'Zoom', icon: 'video_camera_front', desc: 'Requires Zoom connection' },
];

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    title,
    setTitle,
    description,
    setDescription,
    duration,
    setDuration,
    bufferBefore,
    setBufferBefore,
    bufferAfter,
    setBufferAfter,
    maxAdvanceDays,
    setMaxAdvanceDays,
    minNoticeMins,
    setMinNoticeMins,
    timezone,
    setTimezone,
    active,
    setActive,
    conferenceType,
    setConferenceType,
    thumbnail,
    setThumbnail,
    deleteConfirm,
    setDeleteConfirm,
    onDelete,
  } = props;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
            placeholder="Describe what this meeting is about"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Buffer Before (min)</label>
          <input
            type="number"
            min={0}
            value={bufferBefore}
            onChange={(e) => setBufferBefore(Number(e.target.value))}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Buffer After (min)</label>
          <input
            type="number"
            min={0}
            value={bufferAfter}
            onChange={(e) => setBufferAfter(Number(e.target.value))}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Max Advance (days)</label>
          <input
            type="number"
            min={1}
            value={maxAdvanceDays}
            onChange={(e) => setMaxAdvanceDays(Number(e.target.value))}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Min Notice (min)</label>
          <input
            type="number"
            min={0}
            value={minNoticeMins}
            onChange={(e) => setMinNoticeMins(Number(e.target.value))}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Timezone</label>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-foreground">Active</label>
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              active ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                active ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Video Conferencing */}
      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span className="material-icons text-lg">videocam</span>
          Video Conferencing
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Automatically generate a video call link for each booking. The link will be included in confirmation emails.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {CONFERENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setConferenceType(opt.value)}
              className={`p-3 rounded-lg border text-left transition-all ${
                conferenceType === opt.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <span
                className={`material-icons text-xl mb-1 ${
                  conferenceType === opt.value ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {opt.icon}
              </span>
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Block Thumbnail */}
      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span className="material-icons text-lg">image</span>
          Block Thumbnail
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          This image is used as the preview thumbnail when this booking page appears on your website.
        </p>
        <MediaPicker
          value={thumbnail}
          onChange={(url) => setThumbnail(url)}
          label="Select Thumbnail"
          apiEndpoint="/api/portal/media"
        />
      </div>

      {/* Danger zone */}
      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
        {deleteConfirm ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Are you sure? This cannot be undone.</p>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <span className="material-icons text-lg">delete</span>
            Delete Booking Page
          </button>
        )}
      </div>
    </div>
  );
}
