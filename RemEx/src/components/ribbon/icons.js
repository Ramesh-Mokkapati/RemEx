/**
 * Mapping from the @olton/ribbon-menu `mif-*` icon names used in the README
 * to a unicode glyph that can be rendered without bundling the Metro UI icon
 * font. This keeps RemEx runnable offline; if you want the real glyphs,
 * `npm install metro-ui-css` and import its icon stylesheet, then remove this
 * shim from `Icon`.
 */

const MAP = {
  "mif-key": "🔑",
  "mif-users": "👥",
  "mif-user": "👤",
  "mif-shield": "🛡",
  "mif-books": "📚",
  "mif-truck": "🚚",
  "mif-checkmark": "✓",
  "mif-bell-off": "🔕",
  "mif-bell": "🔔",
  "mif-map": "🗺",
  "mif-tree-diagram": "🌐",
  "mif-camera": "📷",
  "mif-file-text": "📄",
  "mif-loop2": "🔄",
  "mif-list": "📋",
  "mif-server": "🖥",
  "mif-chart-bars": "📊",
  "mif-cog": "⚙",
  "mif-rocket": "🚀",
  "mif-envelop": "✉",
  "mif-italic": "𝐼",
  "mif-bold": "𝐁",
  "mif-underline": "U̲",
  "mif-home": "🏠",
  "mif-power": "⏻",
  "mif-info": "ℹ",
  "mif-search": "🔍",
  "mif-plus": "＋",
  "mif-minus": "－",
  "mif-pencil": "✎",
  "mif-bin": "🗑",
  "mif-cloud": "☁",
  "mif-link": "🔗",
  "mif-play": "▶",
  "mif-stop": "■",
  "mif-refresh": "↻",
  "mif-warning": "⚠",
  "mif-image": "🖼",
  "mif-location": "📍",
  "mif-calendar": "📅",
  "mif-download": "⬇",
  "mif-upload": "⬆",
  "mif-car": "🚗",
  "mif-eye": "👁",
  "mif-cogs": "⚙",
  "mif-heartbeat": "💓",
};

export default function Icon({ name, className = "", style }) {
  const glyph = MAP[name] || "•";
  return (
    <span className={`mif ${className}`} aria-hidden="true" style={style} data-icon={name}>
      {glyph}
    </span>
  );
}
