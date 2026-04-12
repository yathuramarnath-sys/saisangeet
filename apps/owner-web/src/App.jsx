import { BrowserRouter } from "react-router-dom";

import { OwnerLayout } from "./components/OwnerLayout";
import { AppRoutes } from "./pages/routes";

export function App() {
  return (
    <BrowserRouter>
      <OwnerLayout>
        <AppRoutes />
      </OwnerLayout>
    </BrowserRouter>
  );
}
