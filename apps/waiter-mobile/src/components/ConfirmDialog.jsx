export function ConfirmDialog({
  variant = "light",
  iconBg,
  iconColor,
  icon,
  title,
  body,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmDanger,
  onCancel,
  onConfirm,
}) {
  return (
    <div
      className={`cdlg-backdrop${variant === "dark" ? " cdlg-backdrop-dark" : ""}`}
      onClick={onCancel}
    >
      <div className="cdlg-card" onClick={(e) => e.stopPropagation()}>
        {/* Icon */}
        <div className="cdlg-icon-wrap" style={{ background: iconBg }}>
          {icon === "trash" && (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          )}
          {icon === "calendar-x" && (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="9.5" y1="14.5" x2="14.5" y2="19.5"/>
              <line x1="14.5" y1="14.5" x2="9.5" y2="19.5"/>
            </svg>
          )}
        </div>

        {/* Title */}
        <h2 className="cdlg-title">{title}</h2>

        {/* Body */}
        <p className="cdlg-body">{body}</p>

        {/* Buttons */}
        <div className="cdlg-btns">
          <button className="cdlg-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`cdlg-confirm${confirmDanger ? " cdlg-confirm-danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
