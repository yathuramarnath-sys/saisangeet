import { useState } from "react";
import { isLoggedIn } from "./lib/auth";

import { LoginScreen }   from "./screens/LoginScreen";
import { LiveScreen }    from "./screens/LiveScreen";
import { SalesScreen }   from "./screens/SalesScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { MoreScreen }    from "./screens/MoreScreen";
import { BottomNav }     from "./components/BottomNav";

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
        {tab === "reports" && <ReportsScreen />}
        {tab === "more"    && <MoreScreen />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
