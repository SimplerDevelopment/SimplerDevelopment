'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutomationPreset {
  key: string;
  name: string;
  description: string;
  icon: string;
  trigger: { event: string; filters?: Record<string, unknown> };
  actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
  conditions?: { field: string; operator: string; value?: unknown }[];
  /** Settings fields shown when enabled */
  settings?: PresetSetting[];
}

export interface PresetSetting {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
  defaultValue: string | number;
  unit?: string; // e.g. "minutes", "hours", "days"
  /** Maps this setting value into the action params at the given path */
  mapsTo: { actionIndex: number; paramKey: string };
}

interface SavedRule {
  id: number;
  name: string;
  enabled: boolean;
  trigger: { event: string; filters?: Record<string, unknown> };
  actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
  conditions: { field: string; operator: string; value?: unknown }[];
  source: string;
  productScope: string | null;
}

interface Props {
  productScope: string;
  presets: AutomationPreset[];
  title?: string;
  description?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ProductAutomationSettings({ productScope, presets, title, description }: Props) {
  const [rules, setRules] = useState<SavedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [settingValues, setSettingValues] = useState<Record<string, Record<string, string | number>>>({});

  // Load existing rules for this product scope
  useEffect(() => {
    fetch('/api/portal/automations')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const productRules = data.rules.filter(
            (r: SavedRule) => r.source === 'settings' && r.productScope === productScope
          );
          setRules(productRules);

          // Initialize setting values from saved rule params
          const vals: Record<string, Record<string, string | number>> = {};
          for (const preset of presets) {
            const existing = productRules.find((r: SavedRule) => r.trigger.event === preset.trigger.event && r.name === preset.name);
            if (existing && preset.settings) {
              vals[preset.key] = {};
              for (const setting of preset.settings) {
                const action = existing.actions[setting.mapsTo.actionIndex];
                if (action?.params[setting.mapsTo.paramKey] !== undefined) {
                  vals[preset.key][setting.key] = action.params[setting.mapsTo.paramKey] as string | number;
                } else {
                  vals[preset.key][setting.key] = setting.defaultValue;
                }
              }
            }
          }
          setSettingValues(vals);
        }
      })
      .finally(() => setLoading(false));
  }, [productScope, presets]);

  const isPresetEnabled = useCallback(
    (preset: AutomationPreset) => {
      return rules.some(
        (r) => r.enabled && r.trigger.event === preset.trigger.event && r.name === preset.name
      );
    },
    [rules]
  );

  const getPresetRule = useCallback(
    (preset: AutomationPreset) => {
      return rules.find(
        (r) => r.trigger.event === preset.trigger.event && r.name === preset.name
      );
    },
    [rules]
  );

  const buildActions = (preset: AutomationPreset, presetKey: string) => {
    const actions = JSON.parse(JSON.stringify(preset.actions));
    const vals = settingValues[presetKey];
    if (vals && preset.settings) {
      for (const setting of preset.settings) {
        const val = vals[setting.key] ?? setting.defaultValue;
        if (actions[setting.mapsTo.actionIndex]) {
          actions[setting.mapsTo.actionIndex].params[setting.mapsTo.paramKey] = val;
        }
      }
    }
    return actions;
  };

  const handleToggle = async (preset: AutomationPreset) => {
    setTogglingKey(preset.key);
    const existing = getPresetRule(preset);

    try {
      if (existing) {
        // Toggle existing rule
        const res = await fetch(`/api/portal/automations/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !existing.enabled }),
        });
        const data = await res.json();
        if (data.success) {
          setRules((prev) =>
            prev.map((r) => (r.id === existing.id ? { ...r, enabled: !existing.enabled } : r))
          );
        }
      } else {
        // Create new rule from preset
        const actions = buildActions(preset, preset.key);
        const res = await fetch('/api/portal/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: preset.name,
            description: preset.description,
            trigger: preset.trigger,
            conditions: preset.conditions || [],
            actions,
            source: 'settings',
            productScope,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRules((prev) => [...prev, data.rule]);
        }
      }
    } finally {
      setTogglingKey(null);
    }
  };

  const handleSettingChange = async (preset: AutomationPreset, settingKey: string, value: string | number) => {
    setSettingValues((prev) => ({
      ...prev,
      [preset.key]: { ...(prev[preset.key] || {}), [settingKey]: value },
    }));

    // If rule exists and is enabled, update it
    const existing = getPresetRule(preset);
    if (existing && existing.enabled) {
      const updatedValues = { ...(settingValues[preset.key] || {}), [settingKey]: value };
      const actions = JSON.parse(JSON.stringify(preset.actions));
      if (preset.settings) {
        for (const s of preset.settings) {
          const val = updatedValues[s.key] ?? s.defaultValue;
          if (actions[s.mapsTo.actionIndex]) {
            actions[s.mapsTo.actionIndex].params[s.mapsTo.paramKey] = val;
          }
        }
      }

      await fetch(`/api/portal/automations/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-icons animate-spin text-2xl text-muted-foreground">autorenew</span>
      </div>
    );
  }

  return (
    <div>
      {title && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-lg text-primary">bolt</span>
            {title}
          </h3>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      )}

      <div className="space-y-3">
        {presets.map((preset) => {
          const enabled = isPresetEnabled(preset);
          const isToggling = togglingKey === preset.key;

          return (
            <div
              key={preset.key}
              className={`bg-card border rounded-xl p-4 transition-colors ${
                enabled ? 'border-primary/30' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      enabled
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <span className="material-icons text-lg">{preset.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-sm">{preset.name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(preset)}
                  disabled={isToggling}
                  className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0 ${
                    enabled ? 'bg-green-500' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Settings fields (visible when enabled) */}
              {enabled && preset.settings && preset.settings.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-3">
                  {preset.settings.map((setting) => {
                    const val = settingValues[preset.key]?.[setting.key] ?? setting.defaultValue;

                    return (
                      <div key={setting.key} className="flex items-center gap-3">
                        <label className="text-xs font-medium text-muted-foreground w-32 shrink-0">
                          {setting.label}
                        </label>

                        {setting.type === 'select' && setting.options && (
                          <select
                            value={String(val)}
                            onChange={(e) => handleSettingChange(preset, setting.key, e.target.value)}
                            className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {setting.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {setting.type === 'number' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={val}
                              onChange={(e) =>
                                handleSettingChange(preset, setting.key, parseInt(e.target.value, 10) || 0)
                              }
                              className="w-20 text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            {setting.unit && (
                              <span className="text-xs text-muted-foreground">{setting.unit}</span>
                            )}
                          </div>
                        )}

                        {setting.type === 'text' && (
                          <input
                            type="text"
                            value={String(val)}
                            onChange={(e) => handleSettingChange(preset, setting.key, e.target.value)}
                            className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
