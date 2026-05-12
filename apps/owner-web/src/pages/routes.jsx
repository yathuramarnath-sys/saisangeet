import { Navigate, Route, Routes } from "react-router-dom";

import { navigation } from "../data/navigation";
import { BusinessProfilePage } from "../features/business/BusinessProfilePage";
import { DevicesPage } from "../features/devices/DevicesPage";
import { DiscountRulesPage } from "../features/discounts/DiscountRulesPage";
import { InventoryPage } from "../features/inventory/InventoryPage";
import { IntegrationsPage } from "../features/integrations/IntegrationsPage";
import { MenuPage } from "../features/menu/MenuPage";
import { OutletsPage } from "../features/outlets/OutletsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { ShiftsCashPage } from "../features/shifts/ShiftsCashPage";
import { StaffPage } from "../features/staff/StaffPage";
import { TaxesReceiptsPage } from "../features/taxes/TaxesReceiptsPage";
import { AppStorePage } from "../features/appstore/AppStorePage";
import { KitchenStationsPage } from "../features/kitchen/KitchenStationsPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { BillingPage } from "../features/billing/BillingPage";
import { OnlineSalesPage } from "../features/settlements/OnlineSalesPage";
import { PrototypePage } from "./PrototypePage";

export function AppRoutes() {
  function renderRoute(item) {
    if (item.mode === "react" && item.id === "dashboard") {
      return <DashboardPage />;
    }

    if (item.mode === "react" && item.id === "business") {
      return <BusinessProfilePage />;
    }

    if (item.mode === "react" && item.id === "outlets") {
      return <OutletsPage />;
    }

    if (item.mode === "react" && item.id === "menu") {
      return <MenuPage />;
    }

    if (item.mode === "react" && item.id === "staff") {
      return <StaffPage />;
    }

    if (item.mode === "react" && item.id === "discounts") {
      return <DiscountRulesPage />;
    }

    if (item.mode === "react" && item.id === "integrations") {
      return <IntegrationsPage />;
    }

    if (item.mode === "react" && item.id === "devices") {
      return <DevicesPage />;
    }

    if (item.mode === "react" && item.id === "inventory") {
      return <InventoryPage />;
    }

    if (item.mode === "react" && item.id === "taxes") {
      return <TaxesReceiptsPage />;
    }

    if (item.mode === "react" && item.id === "shifts") {
      return <ShiftsCashPage />;
    }

    if (item.mode === "react" && item.id === "reports") {
      return <ReportsPage />;
    }

    if (item.mode === "react" && item.id === "kitchen") {
      return <KitchenStationsPage />;
    }

    if (item.mode === "react" && item.id === "appstore") {
      return <AppStorePage />;
    }

    if (item.mode === "react" && item.id === "billing") {
      return <BillingPage />;
    }

    if (item.mode === "react" && item.id === "online-sales") {
      return <OnlineSalesPage />;
    }

    return <PrototypePage prototypeFile={item.prototypeFile} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      {navigation.map((item) => (
        <Route key={item.id} path={item.path} element={renderRoute(item)} />
      ))}
    </Routes>
  );
}
