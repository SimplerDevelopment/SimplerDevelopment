interface WindowConfig {
  width: number;
  height: number;
  left: number;
  top: number;
}

const STORAGE_KEY = 'block-editor-settings-window-config';

export function saveWindowConfig(config: WindowConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save window config:', error);
  }
}

export function getStoredWindowConfig(): WindowConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const config = JSON.parse(stored) as WindowConfig;

    // Validate the stored config
    if (
      typeof config.width === 'number' &&
      typeof config.height === 'number' &&
      typeof config.left === 'number' &&
      typeof config.top === 'number'
    ) {
      return config;
    }

    return null;
  } catch (error) {
    console.error('Failed to load window config:', error);
    return null;
  }
}

export function getDefaultWindowConfig(): WindowConfig {
  const width = 400;
  const height = 600;

  // Center the window on the screen
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  return { width, height, left, top };
}
