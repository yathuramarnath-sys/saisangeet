export function OutletPill({ name, isOpen, cashier }) {
  return (
    <div className={`outlet-pill ${isOpen ? "open" : "closed"}`}>
      <span className="outlet-dot" />
      <span className="outlet-name">{name}</span>
      {isOpen && cashier && <span className="outlet-cashier">{cashier}</span>}
      {!isOpen && <span className="outlet-cashier">Shift closed</span>}
    </div>
  );
}
