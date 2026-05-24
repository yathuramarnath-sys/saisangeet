import { useState } from "react";
import { isLoggedIn } from "./lib/auth";

import { LoginScreen }   from "./screens/LoginScreen";
import { LiveScreen }    from "./screens/LiveScreen";
import { SalesScreen }   from "./screens/SalesScreen";
import { StaffScreen }   from "./screens/StaffScreen";
import { AlertsScreen }  from "./screens/AlertsScreen";
import { ActionsScreen } from "./screens/ActionsScreen";
import { BottomNav }     from "./components/BottomNav";

const TABS = ["live", "sales", "staff", "alerts", "actions"];

export function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [tab, setTab]           = useState("live");

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="app-shell">
      <div className="screen-wrap">
        {tab === "live"    && <LiveScreen />}
        {tab === "sales"   && <SalesScreen />}
        {tab === "staff"   && <StaffScreen />}
        {tab === "alerts"  && <AlertsScreen />}
        {tab === "actions" && <ActionsScreen />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
