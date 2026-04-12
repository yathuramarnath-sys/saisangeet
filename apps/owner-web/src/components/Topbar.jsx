export function Topbar({ eyebrow, title }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>

      <div className="topbar-actions">
        <button type="button" className="secondary-btn">
          Export
        </button>
        <button type="button" className="primary-btn">
          Primary Action
        </button>
      </div>
    </header>
  );
}
