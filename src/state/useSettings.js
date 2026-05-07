import { useCallback, useEffect, useState } from 'react';
import { call } from '../api/tauri';

const DEFAULT = {
  font_family: 'serif',
  font_size: 20,
  line_height: 1.68,
  theme: 'light',
  brightness: 90,
  scroll_mode: true,
  page_animation: 'slide',
  show_progress_bar: true,
  columns: 1,
  margin_width: 3,
  justify_text: false,
  hyphenation: true,
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    call('get_settings')
      .then((s) => setSettings({ ...DEFAULT, ...s }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(async (patch) => {
    setSettings((prev) => {
      const next = patch ? { ...prev, ...patch } : prev;
      call('save_settings', { settings: next }).catch(() => {});
      return next;
    });
  }, []);

  return { settings, ready, update, save };
}
