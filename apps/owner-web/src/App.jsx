import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./lib/AuthContext";
import { OwnerLayout } from "./components/OwnerLayout";
import { AppRoutes } from "./pages/routes";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ProtectedRoute } from "./pages/ProtectedRoute";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <OwnerLayout>
                  <AppRoutes />
                </OwnerLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
