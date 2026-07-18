/**
 * Staff tab — staff-selection toggle plus the assigned-members CRUD list.
 *
 * The toggle (`allowStaffSelection`) is part of the page record and persists
 * via the parent's Save Changes flow. Member adds / activates / removes are
 * immediate-save (own POST/PUT/DELETE on /members) and trigger a refresh.
 */
'use client';

import { useState } from 'react';
import type { PageMember, TeamMember } from '../_lib/types';

interface StaffPanelProps {
  allowStaffSelection: boolean;
  setAllowStaffSelection: (v: boolean) => void;
  pageMembers: PageMember[];
  teamMembers: TeamMember[];
  staffLoading: boolean;
  pageId: string;
  refreshMembers: () => Promise<void>;
  bookingType: 'individual' | 'group';
  setBookingType: (v: 'individual' | 'group') => void;
  groupCapacity: number | null;
  setGroupCapacity: (v: number | null) => void;
  assignmentMode: 'fixed' | 'round_robin' | 'fewest_upcoming';
  setAssignmentMode: (v: 'fixed' | 'round_robin' | 'fewest_upcoming') => void;
  roundRobinPool: { userId: number; weight: number }[];
  setRoundRobinPool: React.Dispatch<React.SetStateAction<{ userId: number; weight: number }[]>>;
}

export function StaffPanel({
  allowStaffSelection,
  setAllowStaffSelection,
  pageMembers,
  teamMembers,
  staffLoading,
  pageId,
  refreshMembers,
  bookingType,
  setBookingType,
  groupCapacity,
  setGroupCapacity,
  assignmentMode,
  setAssignmentMode,
  roundRobinPool,
  setRoundRobinPool,
}: StaffPanelProps) {
  const [addMemberUserId, setAddMemberUserId] = useState<number | ''>('');
  const [addMemberName, setAddMemberName] = useState('');
  const [addMemberColor, setAddMemberColor] = useState('#2563eb');

  async function addMember() {
    if (!addMemberUserId) return;
    try {
      const res = await fetch(`/api/portal/tools/booking/${pageId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: addMemberUserId,
          displayName: addMemberName || null,
          color: addMemberColor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshMembers();
        setAddMemberUserId('');
        setAddMemberName('');
        setAddMemberColor('#2563eb');
      }
    } catch {
      /* ignore */
    }
  }

  async function toggleActive(member: PageMember) {
    await fetch(`/api/portal/tools/booking/${pageId}/members`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, active: !member.active }),
    });
    await refreshMembers();
  }

  async function deleteMember(member: PageMember) {
    if (!confirm(`Remove ${member.displayName || member.userName} from this booking page?`)) {
      return;
    }
    await fetch(`/api/portal/tools/booking/${pageId}/members?memberId=${member.id}`, {
      method: 'DELETE',
    });
    await refreshMembers();
  }

  const inRoundRobinPool = (userId: number) =>
    roundRobinPool.some((p) => p.userId === userId);

  function toggleRoundRobinPool(userId: number) {
    setRoundRobinPool((prev) => {
      if (prev.some((p) => p.userId === userId)) {
        return prev.filter((p) => p.userId !== userId);
      }
      return [...prev, { userId, weight: 1 }];
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-6">
      {/* Booking type — individual vs group/class */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
          <span className="material-icons text-lg">event_seat</span>
          Booking Type
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Choose how this booking page handles capacity. Individual bookings give the
          slot to a single guest. Group / class bookings let multiple attendees share
          the slot up to a fixed capacity.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex cursor-pointer items-start gap-3 p-3 rounded-lg border transition-colors ${
              bookingType === 'individual'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <input
              type="radio"
              name="bookingType"
              value="individual"
              checked={bookingType === 'individual'}
              onChange={() => setBookingType('individual')}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Individual</span>
              <span className="block text-xs text-muted-foreground">
                One booking per slot (1:1 appointment).
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 p-3 rounded-lg border transition-colors ${
              bookingType === 'group'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <input
              type="radio"
              name="bookingType"
              value="group"
              checked={bookingType === 'group'}
              onChange={() => setBookingType('group')}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Group / Class</span>
              <span className="block text-xs text-muted-foreground">
                Multiple attendees per slot (e.g. yoga class).
              </span>
            </span>
          </label>
        </div>

        {bookingType === 'group' && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Group Capacity
            </label>
            <input
              type="number"
              min={1}
              value={groupCapacity ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setGroupCapacity(Number.isFinite(v) && v > 0 ? v : null);
              }}
              placeholder="e.g. 8"
              className="w-32 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum number of attendees that can register for a single time slot.
            </p>
          </div>
        )}
      </div>

      {/* Assignment mode */}
      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
          <span className="material-icons text-lg">shuffle</span>
          Assignment Mode
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Decide how bookings are distributed across staff. Customer-selected staff
          (when enabled below) always overrides this auto-assignment.
        </p>
        <select
          value={assignmentMode}
          onChange={(e) =>
            setAssignmentMode(e.target.value as 'fixed' | 'round_robin' | 'fewest_upcoming')
          }
          className="w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="fixed">Fixed (page owner / first member)</option>
          <option value="round_robin">Round-robin (fewest in next 7 days)</option>
          <option value="fewest_upcoming">Fewest upcoming (load-balance)</option>
        </select>

        {assignmentMode === 'round_robin' && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Round-robin pool — staff eligible for auto-assignment
            </p>
            {pageMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add staff members below to populate the round-robin pool.
              </p>
            ) : (
              <div className="space-y-1">
                {pageMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={inRoundRobinPool(m.userId)}
                      onChange={() => toggleRoundRobinPool(m.userId)}
                    />
                    <span>{m.displayName || m.userName}</span>
                    <span className="text-xs text-muted-foreground">{m.userEmail}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Leave empty to round-robin across all active members of this page.
            </p>
          </div>
        )}
      </div>

      {/* Staff Selection Toggle */}
      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Allow Customer Staff Selection</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              When enabled, customers can choose a specific staff member when booking. When
              disabled, bookings are auto-assigned using the mode above.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAllowStaffSelection(!allowStaffSelection)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              allowStaffSelection ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                allowStaffSelection ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span className="material-icons text-lg">group</span>
          Assigned Staff Members
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Add team members who handle bookings for this page. Each member can have a custom
          display name, color, and availability.
        </p>

        {/* Add member form */}
        <div className="flex items-end gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Team Member
            </label>
            <select
              value={addMemberUserId}
              onChange={(e) => {
                const uid = parseInt(e.target.value);
                setAddMemberUserId(uid || '');
                const tm = teamMembers.find((m) => m.userId === uid);
                if (tm) setAddMemberName(tm.name);
              }}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a team member...</option>
              {teamMembers
                .filter((tm) => !pageMembers.some((pm) => pm.userId === tm.userId))
                .map((tm) => (
                  <option key={tm.userId} value={tm.userId}>
                    {tm.name} ({tm.email})
                  </option>
                ))}
            </select>
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={addMemberName}
              onChange={(e) => setAddMemberName(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
            <input
              type="color"
              value={addMemberColor}
              onChange={(e) => setAddMemberColor(e.target.value)}
              className="w-full h-[38px] bg-background border border-border rounded-lg cursor-pointer"
            />
          </div>
          <button
            onClick={addMember}
            disabled={!addMemberUserId}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <span className="material-icons text-lg align-middle mr-1">person_add</span>
            Add
          </button>
        </div>

        {/* Members list */}
        {staffLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-icons animate-spin text-2xl text-muted-foreground">
              autorenew
            </span>
          </div>
        ) : pageMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <span className="material-icons text-4xl mb-2 block opacity-50">group_off</span>
            <p className="text-sm">No staff members assigned yet.</p>
            <p className="text-xs mt-1">Add team members above to enable staff assignment.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pageMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg"
              >
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: member.color || '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {member.displayName || member.userName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{member.userEmail}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    member.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {member.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(member)}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  title={member.active ? 'Deactivate' : 'Activate'}
                >
                  <span className="material-icons text-lg text-muted-foreground">
                    {member.active ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>
                <button
                  onClick={() => deleteMember(member)}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <span className="material-icons text-lg text-red-500">remove_circle</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pageMembers.length > 0 && (
        <div className="border-t border-border pt-5">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="material-icons text-sm">info</span>
            Remember to click <strong>Save Changes</strong> above to persist the staff selection
            toggle. Staff member additions and removals are saved immediately.
          </p>
        </div>
      )}
    </div>
  );
}
