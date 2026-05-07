import { Icon } from '../../components/Icon';
export function SettingsPanel({ settings, onChange, onSave, onClose }) {
  const themes = [
    { key: 'light',    label: 'Light',    bg: '#F9F9F4' },
    { key: 'sepia',    label: 'Sepia',    bg: '#f4ecd8' },
    { key: 'charcoal', label: 'Charcoal', bg: '#263143' },
    { key: 'oled',     label: 'OLED',     bg: '#000000' },
  ];
  const updateNumber = (key, mapper = Number) => (event) => {
    onChange({ [key]: mapper(event.target.value) });
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Reading Settings</h2>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" className="ms" />
          </button>
        </div>

        <div className="settings-body">
          {/* Typography */}
          <div className="settings-section">
            <div className="settings-section-label">
              <Icon name="text_fields" className="ms" /> Typography
            </div>

            <div className="settings-item">
              <div className="settings-row">
                <span className="settings-label">Font</span>
              </div>
              <div className="s-seg-group">
                {[['serif','Serif (Newsreader)'],['sans','Sans (Inter)']].map(([k, l]) => (
                  <button
                    key={k}
                    className={`s-seg-btn ${settings.font_family === k ? 'active' : ''}`}
                    onClick={() => onChange({ font_family: k })}
                    style={k === 'serif' ? { fontFamily: 'var(--font-reading)' } : {}}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-row">
                <span className="settings-label">Font Size</span>
                <span className="settings-val">{settings.font_size}px</span>
              </div>
              <div className="slider-wrap">
                <Icon name="format_size" className="ms sm" />
                <input
                  type="range" className="s-range"
                  min={12} max={32} value={settings.font_size}
                  onInput={updateNumber('font_size')}
                  onChange={updateNumber('font_size')}
                />
                <Icon name="format_size" className="ms" style={{ fontSize: 22 }} />
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-row">
                <span className="settings-label">Line Height</span>
                <span className="settings-val">{settings.line_height.toFixed(2)}</span>
              </div>
              <input
                type="range" className="s-range"
                min={12} max={26} value={Math.round(settings.line_height * 10)}
                onInput={updateNumber('line_height', (value) => +value / 10)}
                onChange={updateNumber('line_height', (value) => +value / 10)}
              />
            </div>

            <div className="settings-item">
              <div className="settings-row">
                <span className="settings-label">Margins</span>
                <span className="settings-val">Level {settings.margin_width}</span>
              </div>
              <input
                type="range" className="s-range"
                min={1} max={5} value={settings.margin_width}
                onInput={updateNumber('margin_width')}
                onChange={updateNumber('margin_width')}
              />
            </div>

            <div className="settings-item">
              <div className="settings-row">
                <span className="settings-label">Layout</span>
              </div>
              <div className="s-seg-group">
                {[['1','Single Column'],['2','Two Column']].map(([k, l]) => (
                  <button
                    key={k}
                    className={`s-seg-btn ${String(settings.columns) === k ? 'active' : ''}`}
                    onClick={() => onChange({ columns: +k })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Visuals */}
          <div className="settings-section">
            <div className="settings-section-label">
              <Icon name="palette" className="ms" /> Theme
            </div>

            <div className="settings-item">
              <div className="theme-grid">
                {themes.map(({ key, label, bg }) => (
                  <button
                    key={key}
                    className={`theme-cell ${settings.theme === key ? 'active' : ''}`}
                    onClick={() => onChange({ theme: key })}
                  >
                    <div className="theme-swatch" style={{ background: bg }} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-row">
                <span className="settings-label">Brightness</span>
                <span className="settings-val">{settings.brightness}%</span>
              </div>
              <div className="slider-wrap">
                <Icon name="brightness_low" className="ms sm" />
                <input
                  type="range" className="s-range"
                  min={30} max={100} value={settings.brightness}
                  onInput={updateNumber('brightness')}
                  onChange={updateNumber('brightness')}
                />
                <Icon name="brightness_high" className="ms" />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="settings-section">
            <div className="settings-section-label">
              <Icon name="tune" className="ms" /> Controls
            </div>

            <div className="toggle-item">
              <div>
                <div className="toggle-item-label">Justify Text</div>
                <div className="toggle-item-sub">Full-justify paragraph alignment</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.justify_text}
                  onChange={(e) => onChange({ justify_text: e.target.checked })}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
              </label>
            </div>

            <div className="toggle-item">
              <div>
                <div className="toggle-item-label">Continuous Scroll</div>
                <div className="toggle-item-sub">Scroll through all chapters</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.scroll_mode}
                  onChange={(e) => onChange({ scroll_mode: e.target.checked })}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', height: 42 }} onClick={onSave}>
            <Icon name="check" className="ms sm" /> Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}
