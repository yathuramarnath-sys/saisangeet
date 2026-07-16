import { useEffect, useRef, useState } from "react";
import { BulkImportPanel } from "./BulkImportPanel";
import { ItemForm } from "./ItemForm";
import { LabelPrintModal } from "./LabelPrintModal";

import {
  subscribeRestaurantState,
  updateInventoryState,
  updateMenuControls
} from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import {
  createMenuAssignment,
  createCustomMenuItem,
  createMenuCategory,
  createMenuGroup,
  createMenuStation,
  createPricingProfile,
  deleteMenuCategory,
  deleteCustomMenuItem,
  fetchMenuData,
  updateMenuAssignment,
  updateMenuConfiguration,
  updateCustomMenuItem,
  updateMenuCategory,
  updateMenuGroup,
  updatePricingProfile,
  bulkSetCategoryUnit
} from "./menu.service";
import { api } from "../../lib/api";

// ── Menu field settings (mirrors BusinessProfilePage) ─────────────────────────
const MENU_FIELD_LABELS = {
  description:       "Item Description",
  shortCode:         "Short Code (KOT print)",
  hsnCode:           "HSN / SAC Code",
  rank:              "Item Rank / Sort Order",
  packingCharges:    "Packing Charges",
  exposeInCaptain:   "Expose in Captain App",
  allowDecimalQty:   "Allow Decimal Quantity",
  manufacturingDate: "Manufacturing Date",
  expiryDate:        "Expiry Date",
  sku:               "SKU / Barcode",
};

const MENU_FIELD_DESCRIPTIONS = {
  description:       "Show a description field on each item. Captains can read it before ordering.",
  shortCode:         "Short 3–5 letter code printed on KOT tickets (e.g. PNT for Paneer Tikka).",
  hsnCode:           "HSN / SAC code required on GST tax invoices.",
  rank:              "Controls display order in POS grid and Captain App menu list.",
  packingCharges:    "Per-item packing charge added to bill for takeaway and delivery orders.",
  exposeInCaptain:   "Hide specific items from the Captain App waiter menu (e.g. staff meals).",
  allowDecimalQty:   "Allow quantities like 0.5 or 1.5 kg for weight-based items.",
  manufacturingDate: "Track manufacturing date per item — for bakeries, sweet shops, pre-cooked items.",
  expiryDate:        "Track expiry date per item — for bakeries, sweet shops, pre-cooked items.",
  sku:               "Barcode / SKU number for barcode scanner billing at POS.",
};

const DEFAULT_FIELD_SETTINGS = {
  description: false, shortCode: false, hsnCode: false, rank: false,
  packingCharges: false, exposeInCaptain: false, allowDecimalQty: false,
  manufacturingDate: false, expiryDate: false, sku: true,
};

function statusClass(status) {
  return status === "Review" ? "warning" : "online";
}

function foodPillClass(foodType) {
  return foodType === "Non-Veg" ? "pill non-veg" : "pill veg";
}

function toggleOutlet(item, outletName) {
  return {
    ...item,
    outletAvailability: (item.outletAvailability || []).map((entry) =>
      entry.outlet === outletName ? { ...entry, enabled: !entry.enabled } : entry
    )
  };
}

function buildDefaultItemDraft(menuData) {
  return {
    itemName: "",
    categoryName: menuData.categories[0]?.name || "",
    foodType: "Veg",
    unit: "",
    station: "",
    // New pricing model
    basePrice: "0",
    onlinePrice: "0",
    areaOverrides: {},
    takeawayPackingCharge: "0",
    deliveryPackingCharge: "0",
    taxRate: "5",
    availableFrom: "",
    availableTo: "",
    trackInventory: "Disabled",
    selectedOutlets: [],
    selectedAreas: [],
    // optional fields
    description: "", shortCode: "", hsnCode: "", sku: "", scalePlu: "",
    rank: "999",
    exposeInCaptain: true, allowDecimalQty: false,
    manufacturingDate: "", expiryDate: "",
  };
}

function priceValue(pricing, area, field) {
  const value = pricing.find((row) => row.area === area)?.[field] || "0";
  const numericValue = String(value).replace(/[^0-9.]/g, "");
  return numericValue || "0";
}

function moneyValue(value) {
  const numericValue = String(value || "0").replace(/[^0-9.]/g, "");
  return numericValue || "0";
}

function buildDefaultGroupDraft(menuData) {
  return {
    id: "",
    name: "",
    status: "Live",
    categoryIds: menuData.categories.slice(0, 1).map((category) => category.id),
    channels: "Dine-In, Takeaway",
    availability: "Always on",
    note: ""
  };
}

function buildDefaultAssignmentDraft(menuData) {
  return {
    id: "",
    menuGroupId: menuData.menuGroups[0]?.id || "",
    outletId: menuData.outlets[0]?.id || "",
    channels: "Dine-In, Takeaway",
    availability: "Always on",
    status: "Ready"
  };
}

function buildDefaultPricingProfileDraft() {
  return {
    id: "",
    name: "",
    dineInMode: "Area wise",
    takeawayMode: "Single price",
    deliveryMode: "Single price",
    takeawayParcelChargeType: "None",
    takeawayParcelChargeValue: "0",
    deliveryParcelChargeType: "None",
    deliveryParcelChargeValue: "0",
    isActive: false
  };
}


export function MenuPage() {
  const [menuData, setMenuData] = useState({
    menuConfig: {
      defaultPricingMode: "Area + order type",
      pricingZones: [],
      orderTypes: [],
      defaultTaxProfileId: "",
      defaultPricingProfileId: "",
      menuStructureNote: ""
    },
    categories: [],
    stations: [],
    items: [],
    outlets: [],
    taxProfiles: [],
    pricingProfiles: [],
    menuGroups: [],
    menuAssignments: [],
    menuAlerts: []
  });
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryAvailableFrom, setCategoryAvailableFrom] = useState("10:00");
  const [categoryAvailableTo, setCategoryAvailableTo] = useState("16:00");
  const [categorySelectedOutlets, setCategorySelectedOutlets] = useState([]);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryAvailableFrom, setEditingCategoryAvailableFrom] = useState("");
  const [editingCategoryAvailableTo, setEditingCategoryAvailableTo] = useState("");
  const [editingCategorySelectedAreas, setEditingCategorySelectedAreas] = useState([]);
  const [editingCategoryOutletName, setEditingCategoryOutletName] = useState("");
  const [editingCategoryOnline, setEditingCategoryOnline] = useState(false);
  const [stationName, setStationName] = useState("");
  const [itemDraft, setItemDraft] = useState({ categoryName: "", station: "" });
  const [editingItemId, setEditingItemId] = useState("");
  const [editDraft, setEditDraft] = useState(null);
  const [configDraft, setConfigDraft] = useState({
    defaultPricingMode: "Area + order type",
    pricingZones: "AC, Non-AC, Self Service",
    orderTypes: "Dine-In, Takeaway, Delivery",
    defaultTaxProfileId: "",
    defaultPricingProfileId: "",
    menuStructureNote: "One page, simple assignment"
  });
  const [groupDraft, setGroupDraft] = useState(buildDefaultGroupDraft({ categories: [] }));
  const [assignmentDraft, setAssignmentDraft] = useState(
    buildDefaultAssignmentDraft({ menuGroups: [], outlets: [] })
  );
  const [pricingProfileDraft, setPricingProfileDraft] = useState(buildDefaultPricingProfileDraft());
  const [librarySearch, setLibrarySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState("Any");
  const [foodTypeFilter, setFoodTypeFilter] = useState("Any");
  const [taxFilter, setTaxFilter] = useState("Any"); // "Any" | "Missing"
  const [unitFilter, setUnitFilter] = useState("Any"); // "Any" | "KG" | "G" | "LTR" | "ML" | "PCS"
  const [bulkUnit, setBulkUnit] = useState(""); // unit to bulk-assign to category
  const [bulkUnitSaving, setBulkUnitSaving] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [outletFilter, setOutletFilter] = useState("all"); // "all" | outlet name — Item Library tab's branch filter
  const [categoryListOutletFilter, setCategoryListOutletFilter] = useState("all"); // "all" | outlet name — Category List panel's own branch filter, independent of the Item Library one
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [itemPage, setItemPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [autoNumbering, setAutoNumbering] = useState(false);
  const [routingDrafts, setRoutingDrafts] = useState({});
  const [labelItem, setLabelItem] = useState(null); // item to print labels for
  const formRef = useRef(null);

  // ── Tabs + Field Settings ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("items"); // "items" | "field-settings"
  const [menuFieldSettings, setMenuFieldSettings] = useState(DEFAULT_FIELD_SETTINGS);
  const [fieldSettingsSaving, setFieldSettingsSaving] = useState(false);
  const [fieldSettingsMsg, setFieldSettingsMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMenuData();

      if (!cancelled) {
        setMenuData(result);
        setLoading(false);
        setItemDraft((current) =>
          current.categoryName || current.station ? current : buildDefaultItemDraft(result)
        );
        setConfigDraft({
          defaultPricingMode: result.menuConfig.defaultPricingMode || "Area + order type",
          pricingZones: (result.menuConfig.pricingZones || []).join(", "),
          orderTypes: (result.menuConfig.orderTypes || []).join(", "),
          defaultTaxProfileId: result.menuConfig.defaultTaxProfileId || result.taxProfiles[0]?.id || "",
          defaultPricingProfileId:
            result.menuConfig.defaultPricingProfileId || result.pricingProfiles?.find((profile) => profile.isActive)?.id || "",
          menuStructureNote: result.menuConfig.menuStructureNote || "One page, simple assignment"
        });
        setGroupDraft(buildDefaultGroupDraft(result));
        setAssignmentDraft(buildDefaultAssignmentDraft(result));
      }
    }

    // Load field settings from business profile
    api.get("/business-profile")
      .then((bp) => {
        if (!cancelled && bp?.menuFieldSettings) {
          setMenuFieldSettings({ ...DEFAULT_FIELD_SETTINGS, ...bp.menuFieldSettings });
        }
      })
      .catch(() => {});

    load();

    const unsubscribe = subscribeRestaurantState(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const categoryCount = menuData.categories.length;
  const itemCount = menuData.items.length;
  const reviewCount = menuData.items.filter((item) => item.status === "Review").length;
  const vegItemCount = menuData.items.filter((item) => item.foodType === "Veg").length;
  // Only flag items where taxRate is genuinely missing (null/undefined/"") — 0% is valid for exempt items
  const missingTaxCount = menuData.items.filter((item) => item.taxRate === null || item.taxRate === undefined || item.taxRate === "").length;
  const kitchenMappedCount = menuData.items.filter(
    (item) => item.station && item.station !== "Station pending"
  ).length;
  const inventoryTrackedCount = menuData.items.filter((item) => item.inventoryTracking.enabled).length;
  const missingPriceCount = menuData.items.filter(
    (item) => !item.price && !item.basePrice && !(item.pricing?.length)
  ).length;
  const missingStationCount = menuData.items.filter(
    (item) => !item.station || item.station === "Station pending"
  ).length;
  const dynamicAlerts = [
    missingTaxCount > 0
      ? {
          id: "missing-tax-live",
          title: `${missingTaxCount} items missing tax setup`,
          description: "Set tax mode and tax rate before billing starts."
        }
      : null,
    missingPriceCount > 0
      ? {
          id: "missing-pricing-live",
          title: `${missingPriceCount} items missing dine-in pricing`,
          description: "Complete AC, Non-AC, and Self Service prices before outlet launch."
        }
      : null,
    missingStationCount > 0
      ? {
          id: "missing-station-live",
          title: `${missingStationCount} items missing kitchen station`,
          description: "KOT routing will fail for items without a kitchen station."
        }
      : null
  ].filter(Boolean);
  const categoryGroups = menuData.categories.map((category) => ({
    ...category,
    items: menuData.items.filter((item) => item.categoryId === category.id)
  }));
  const availableCategoryNames = menuData.categories.map((category) => category.name);

  // Categories that actually have items in the selected outlet.
  // When outlet = "all" → show every category.
  // When a specific outlet is selected → only show categories that have
  // at least one enabled item at that outlet (so the dropdown matches
  // what you actually see in the item list).
  const filteredCategoryNames = outletFilter === "all"
    ? availableCategoryNames
    : [...new Set(
        menuData.items
          .filter(item => {
            const oa = item.outletAvailability || [];
            if (oa.length === 0) return true; // no restriction = available everywhere
            return oa.some(e => e.outlet === outletFilter && e.enabled);
          })
          .map(item => item.categoryName)
          .filter(Boolean)
      )];

  // Categories shown in the "Category List" panel for the selected branch.
  // A category with an explicit outletAvailability is restricted to exactly
  // those branches; one without it falls back to inferring from THIS
  // category's own items (category.items, scoped by categoryId) — never by
  // category name, since two unrelated categories at different branches can
  // share the same name (e.g. "Fries"), and a name-based fallback would leak
  // one branch's item availability onto the other branch's same-named category.
  const filteredCategoryGroups = categoryGroups.filter((category) => {
    if (categoryListOutletFilter === "all") return true;
    const oa = category.outletAvailability || [];
    if (oa.length > 0) {
      return oa.some((e) => e.outlet === categoryListOutletFilter && e.enabled);
    }
    return category.items.some((item) => {
      const itemOa = item.outletAvailability || [];
      if (itemOa.length === 0) return true;
      return itemOa.some((e) => e.outlet === categoryListOutletFilter && e.enabled);
    });
  });

  const availableStationNames = menuData.stations.map((station) => station.name);
  const availableOutlets = menuData.outlets || [];

  // Category List panel groups categories under a header for each branch.
  // A category with no outletAvailability is sold at every branch, so it
  // appears under every branch's header rather than a separate catch-all section.
  const outletsForCategoryList = categoryListOutletFilter === "all"
    ? availableOutlets
    : availableOutlets.filter((o) => o.name === categoryListOutletFilter);
  const categoryGroupsByOutlet = outletsForCategoryList.length > 0
    ? outletsForCategoryList.map((outlet) => ({
        outlet,
        categories: filteredCategoryGroups.filter((category) => {
          const oa = category.outletAvailability || [];
          if (oa.length === 0) return true;
          return oa.some((e) => e.enabled && e.outlet === outlet.name);
        })
      }))
    : [{ outlet: { id: "__none__", name: "All categories" }, categories: filteredCategoryGroups }];

  // Work areas for the currently selected branch only — "all" falls back to the union across outlets
  const availableAreas = [...new Set(
    outletFilter === "all"
      ? (menuData.outlets || []).flatMap(o => o.workAreas || []).filter(Boolean)
      : (availableOutlets.find(o => o.name === outletFilter)?.workAreas || []).filter(Boolean)
  )];

  // Areas for ONE specific branch, regardless of the page-level outlet filter —
  // used by the category Add/Edit forms so area options always match the
  // branch picked in that form, not whatever branch the page happens to be browsing.
  function workAreasForOutlet(outletName) {
    if (!outletName) {
      return [...new Set(availableOutlets.flatMap((o) => o.workAreas || []).filter(Boolean))];
    }
    return (availableOutlets.find((o) => o.name === outletName)?.workAreas || []).filter(Boolean);
  }
  const availableTaxProfiles = menuData.taxProfiles || [];
  const availablePricingProfiles = menuData.pricingProfiles || [];
  const availableMenuGroups = menuData.menuGroups || [];
  // Per-outlet item counts for the filter chips
  const outletItemCounts = availableOutlets.reduce((acc, o) => {
    acc[o.name] = menuData.items.filter((item) => {
      const oa = item.outletAvailability || [];
      // No availability data means available everywhere
      if (oa.length === 0) return true;
      return oa.some((entry) => entry.outlet === o.name && entry.enabled);
    }).length;
    return acc;
  }, {});

  const filteredLibraryItems = menuData.items.filter((item) => {
    const matchesSearch =
      !librarySearch ||
      item.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      (item.categoryName || "").toLowerCase().includes(librarySearch.toLowerCase()) ||
      (item.sku || "").toLowerCase().includes(librarySearch.toLowerCase());
    const matchesCategory = categoryFilter === "All" || item.categoryName === categoryFilter;
    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Active" && item.salesAvailability !== "Sold Out") ||
      (statusFilter === "Sold Out" && item.salesAvailability === "Sold Out") ||
      item.status === statusFilter;
    const matchesInventory =
      inventoryFilter === "Any" ||
      (inventoryFilter === "Tracked" && item.inventoryTracking.enabled) ||
      (inventoryFilter === "Not tracked" && !item.inventoryTracking.enabled);
    const matchesFoodType = foodTypeFilter === "Any" || item.foodType === foodTypeFilter;
    const matchesTax = taxFilter === "Any" || (taxFilter === "Missing" && (item.taxRate === null || item.taxRate === undefined || item.taxRate === ""));
    const matchesUnit = unitFilter === "Any" ||
      (unitFilter === "PCS" ? !item.unit : item.unit === unitFilter);
    // Outlet filter: "all" shows everything; specific outlet shows only enabled items
    const matchesOutlet =
      outletFilter === "all" ||
      (item.outletAvailability || []).length === 0 || // no data = available everywhere
      (item.outletAvailability || []).some(
        (entry) => entry.outlet === outletFilter && entry.enabled
      );

    return matchesSearch && matchesCategory && matchesStatus && matchesInventory && matchesFoodType && matchesTax && matchesUnit && matchesOutlet;
  });

  // Reset to page 1 whenever filters change
  useEffect(() => { setItemPage(1); }, [librarySearch, categoryFilter, statusFilter, inventoryFilter, foodTypeFilter, taxFilter, unitFilter, outletFilter]);

  const totalPages   = Math.max(1, Math.ceil(filteredLibraryItems.length / ITEMS_PER_PAGE));
  const pagedItems   = filteredLibraryItems.slice((itemPage - 1) * ITEMS_PER_PAGE, itemPage * ITEMS_PER_PAGE);

  function updateItem(itemId, updater) {
    setMenuData((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? updater(item) : item))
    }));
  }

  // Auto-increment Scale PLU: find max existing, next = max + 1
  const nextScalePlu = (() => {
    const used = (menuData?.items || [])
      .map(i => parseInt(i.scalePlu || 0, 10))
      .filter(n => n > 0);
    return used.length > 0 ? Math.max(...used) + 1 : 1;
  })();

  function printScaleSheet() {
    const weightItems = (menuData?.items || [])
      .filter(i => ["KG", "G"].includes(i.unit) && i.scalePlu)
      .sort((a, b) => parseInt(a.scalePlu) - parseInt(b.scalePlu));
    if (weightItems.length === 0) {
      alert("No weight items with Scale PLU set yet.\nSet Unit = KG/G on your items — Scale PLU will be auto-assigned.");
      return;
    }
    const rows = weightItems.map(i => `
      <tr>
        <td>${String(parseInt(i.scalePlu)).padStart(5, "0")}</td>
        <td>${i.name || i.itemName || ""}</td>
        <td>₹${parseFloat(i.basePrice || i.price || 0).toFixed(2)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;padding:24px;color:#111}
  h2{margin:0 0 4px;font-size:18px}
  .sub{color:#6b7280;font-size:12px;margin:0 0 20px}
  table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:8px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:9px 14px;font-size:14px;border-bottom:1px solid #f0f0f0}
  td:first-child{font-family:monospace;font-weight:700;font-size:15px}
  td:last-child{font-weight:700;color:#059669}
  .note{margin-top:20px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
</style></head><body>
<h2>⚖️ Scale Programming Reference</h2>
<p class="sub">All prices are per 100 grams. Programme each PLU in the scale with the item name and price shown.</p>
<table>
  <thead><tr><th>PLU</th><th>Item Name</th><th>Price / 100g</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="note">
  Generated from Plato Owner Console.<br/>
  If scale is unavailable: enter weight in grams ÷ 100 as quantity at the POS cashier (e.g. 1.5 kg = qty 15).
</div>
</body></html>`;
    const w = window.open("", "_blank", "width=700,height=600");
    if (!w) { alert("Allow pop-ups to print the scale sheet."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.onafterprint = () => w.close(); }, 400);
  }

  async function handleBulkSetUnit() {
    if (!categoryFilter || categoryFilter === "All" || !bulkUnit) return;
    setBulkUnitSaving(true);
    try {
      await bulkSetCategoryUnit(categoryFilter, bulkUnit);
      await reloadMenu();
      setBulkUnit("");
    } finally {
      setBulkUnitSaving(false);
    }
  }

  async function reloadMenu() {
    const result = await fetchMenuData();
    setMenuData(result);
    setLoading(false);
    setItemDraft((current) => ({
      categoryName: current.categoryName || result.categories[0]?.name || "",
      station: current.station || result.stations[0]?.name || ""
    }));
    setRoutingDrafts((current) => {
      const next = { ...current };
      result.categories.forEach((category) => {
        next[category.id] = next[category.id] || {
          station: category.station || (result.stations[0]?.name || ""),
          printerTarget: category.printerTarget || "",
          displayTarget: category.displayTarget || ""
        };
      });
      return next;
    });
    setConfigDraft({
      defaultPricingMode: result.menuConfig.defaultPricingMode || "Area + order type",
      pricingZones: (result.menuConfig.pricingZones || []).join(", "),
      orderTypes: (result.menuConfig.orderTypes || []).join(", "),
      defaultTaxProfileId: result.menuConfig.defaultTaxProfileId || result.taxProfiles[0]?.id || "",
      defaultPricingProfileId:
        result.menuConfig.defaultPricingProfileId || result.pricingProfiles?.find((profile) => profile.isActive)?.id || "",
      menuStructureNote: result.menuConfig.menuStructureNote || "One page, simple assignment"
    });
    setGroupDraft((current) => (current.id ? current : buildDefaultGroupDraft(result)));
    setAssignmentDraft((current) => (current.id ? current : buildDefaultAssignmentDraft(result)));
    return result;
  }

  async function handleSaveItem(event) {
    event.preventDefault();
    try {
      setSaveError("");
      setSaveMessage("");
      await createCustomMenuItem({
        ...itemDraft,
        availableAreas,
        outletAvailability: itemDraft.selectedOutlets?.length
          ? itemDraft.selectedOutlets.map((name) => ({ outlet: name, enabled: true }))
          : availableOutlets.map((o) => ({ outlet: o.name, enabled: true })),
        areaAvailability: itemDraft.selectedAreas?.length
          ? itemDraft.selectedAreas.map((name) => ({ area: name, enabled: true }))
          : [],
      });
      const result = await reloadMenu();
      setItemDraft(buildDefaultItemDraft(result));
      setSaveMessage("New menu item saved.");
    } catch (error) {
      setSaveError(error.message || "Unable to save the new menu item.");
    }
  }

  async function handleCreateCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!categoryName.trim()) {
      setSaveError("Category name is required.");
      return;
    }

    try {
      setSaveError("");
      setSaveMessage("");
      await createMenuCategory(categoryName.trim(), {
        availableFrom: categoryAvailableFrom,
        availableTo: categoryAvailableTo,
        outletAvailability: categorySelectedOutlets.map((name) => ({ outlet: name, enabled: true }))
      });
      setCategoryName("");
      setCategoryAvailableFrom("10:00");
      setCategoryAvailableTo("16:00");
      setCategorySelectedOutlets([]);
      await reloadMenu();
      form.reset();
      setSaveMessage("New category created.");
    } catch (error) {
      setSaveError(error.message || "Unable to create category.");
    }
  }

  // outletName is the branch header this edit was opened from — "" for the
  // single-section fallback when the tenant has no outlets configured yet.
  // Areas are scoped per branch (category.areaByOutlet[outletName]), since the
  // same shared category can have different work areas at different branches.
  function startEditingCategory(category, outletName = "") {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingCategoryAvailableFrom(category.availableFrom || "");
    setEditingCategoryAvailableTo(category.availableTo || "");
    setEditingCategoryOutletName(outletName);
    const perOutletAreas = outletName ? category.areaByOutlet?.[outletName] : null;
    const areasSource = perOutletAreas || category.areaAvailability || [];
    setEditingCategorySelectedAreas(areasSource.filter((e) => e.enabled).map((e) => e.area));
    // Swiggy/Zomato listing is a category-wide flag, not scoped per branch — it
    // always reads/writes category.areaAvailability regardless of which branch
    // header this edit was opened from (that's the field dynoapis.routes.js checks).
    const onlineTag = (category.areaAvailability || []).find((e) => e.area === "Online");
    setEditingCategoryOnline(!!(onlineTag && onlineTag.enabled));
    setSaveError("");
    setSaveMessage("");
  }

  function cancelEditingCategory() {
    setEditingCategoryId("");
    setEditingCategoryName("");
    setEditingCategoryAvailableFrom("");
    setEditingCategoryAvailableTo("");
    setEditingCategorySelectedAreas([]);
    setEditingCategoryOutletName("");
    setEditingCategoryOnline(false);
  }

  async function handleSaveCategoryEdit(category) {
    if (!editingCategoryName.trim()) {
      setSaveError("Category name is required.");
      return;
    }

    try {
      setSaveError("");
      setSaveMessage("");
      const newAreaEntries = editingCategorySelectedAreas.map((name) => ({ area: name, enabled: true }));
      // "Online" always lives in areaAvailability (never areaByOutlet) — Swiggy/
      // Zomato listing isn't scoped per dine-in branch, and dynoapis.routes.js
      // only ever reads category.areaAvailability for its gating check.
      const onlineEntries = editingCategoryOnline ? [{ area: "Online", enabled: true }] : [];
      const payload = {
        name: editingCategoryName.trim(),
        availableFrom: editingCategoryAvailableFrom,
        availableTo: editingCategoryAvailableTo,
      };
      if (editingCategoryOutletName) {
        payload.areaByOutlet = {
          ...(category.areaByOutlet || {}),
          [editingCategoryOutletName]: newAreaEntries
        };
        payload.areaAvailability = [
          ...(category.areaAvailability || []).filter((e) => e.area !== "Online"),
          ...onlineEntries
        ];
      } else {
        payload.areaAvailability = [...newAreaEntries, ...onlineEntries];
      }
      await updateMenuCategory(category.id, payload);
      await reloadMenu();
      cancelEditingCategory();
      setSaveMessage("Category updated.");
    } catch (error) {
      setSaveError(error.message || "Unable to update category.");
    }
  }

  async function handleDeleteCategory(category) {
    // Check if any items in this category appear in active POS orders
    const categoryItemIds = new Set(
      menuData.items.filter(i => i.categoryId === category.id).map(i => i.id)
    );
    let activeOrderWarning = "";
    if (categoryItemIds.size > 0) {
      try {
        const activeOrders = await api.get("/operations/orders").catch(() => []);
        const orders = Array.isArray(activeOrders) ? activeOrders : [];
        const affectedTables = new Set();
        orders.forEach(order => {
          (order.items || []).forEach(item => {
            if (!item.isVoided && (categoryItemIds.has(item.menuItemId) || categoryItemIds.has(item.id))) {
              affectedTables.add(order.tableId);
            }
          });
        });
        if (affectedTables.size > 0) {
          activeOrderWarning = `\n\n⚠️ WARNING: Items from this category are currently in ${affectedTables.size} active table order(s) on POS. Deleting now will cause "item not found" errors on those tables.\n\nTip: Wait until service ends, or mark items as Sold Out instead.`;
        }
      } catch (_) {}
    }

    if (!window.confirm(
      `Delete category "${category.name}"? All items in this category will also be removed.${activeOrderWarning}\n\nThis cannot be undone.`
    )) {
      return;
    }

    try {
      setSaveError("");
      setSaveMessage("");
      await deleteMenuCategory(category.id);
      await reloadMenu();
      if (editingCategoryId === category.id) {
        cancelEditingCategory();
      }
      setSaveMessage("Category deleted.");
    } catch (error) {
      setSaveError(error.message || "Unable to delete category.");
    }
  }

  async function handleCreateStation(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!stationName.trim()) {
      setSaveError("Kitchen station name is required.");
      return;
    }

    try {
      setSaveError("");
      setSaveMessage("");
      await createMenuStation(stationName.trim());
      setStationName("");
      await reloadMenu();
      form.reset();
      setSaveMessage("New kitchen station created.");
    } catch (error) {
      setSaveError(error.message || "Unable to create kitchen station.");
    }
  }

  function updateRoutingDraft(categoryId, field, value) {
    setRoutingDrafts((current) => ({
      ...current,
      [categoryId]: {
        ...current[categoryId],
        [field]: value
      }
    }));
  }

  function updateItemDraft(field, value) {
    setItemDraft((current) => {
      const next = { ...current, [field]: value };
      // Station is no longer set per-item; routing is handled by Kitchen Stations → Category mapping
      return next;
    });
  }

  async function handleSaveRouting(categoryId) {
    try {
      setSaveError("");
      setSaveMessage("");
      await updateMenuCategory(categoryId, routingDrafts[categoryId]);
      await reloadMenu();
      setSaveMessage("Category routing updated.");
    } catch (error) {
      setSaveError(error.message || "Unable to update category routing.");
    }
  }

  function updateConfigField(field, value) {
    setConfigDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSaveConfiguration(event) {
    event.preventDefault();

    try {
      setSaveError("");
      setSaveMessage("");
      await updateMenuConfiguration({
        defaultPricingMode: configDraft.defaultPricingMode,
        pricingZones: configDraft.pricingZones
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        orderTypes: configDraft.orderTypes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        defaultTaxProfileId: configDraft.defaultTaxProfileId,
        defaultPricingProfileId: configDraft.defaultPricingProfileId,
        menuStructureNote: configDraft.menuStructureNote
      });
      await reloadMenu();
      setSaveMessage("Menu configuration updated.");
    } catch (error) {
      setSaveError(error.message || "Unable to update menu configuration.");
    }
  }

  function toggleGroupCategory(categoryId) {
    setGroupDraft((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId]
    }));
  }

  function startEditingPricingProfile(profile) {
    setPricingProfileDraft({
      id: profile.id,
      name: profile.name,
      dineInMode: profile.dineInMode || "Area wise",
      takeawayMode: profile.takeawayMode || "Single price",
      deliveryMode: profile.deliveryMode || "Single price",
      takeawayParcelChargeType: profile.takeawayParcelChargeType || "None",
      takeawayParcelChargeValue: String(profile.takeawayParcelChargeValue || 0),
      deliveryParcelChargeType: profile.deliveryParcelChargeType || "None",
      deliveryParcelChargeValue: String(profile.deliveryParcelChargeValue || 0),
      isActive: Boolean(profile.isActive)
    });
  }

  function cancelPricingProfileEdit() {
    setPricingProfileDraft(buildDefaultPricingProfileDraft());
  }

  async function handleSavePricingProfile(event) {
    event.preventDefault();

    try {
      setSaveError("");
      setSaveMessage("");
      const payload = {
        name: pricingProfileDraft.name,
        dineInMode: pricingProfileDraft.dineInMode,
        takeawayMode: pricingProfileDraft.takeawayMode,
        deliveryMode: pricingProfileDraft.deliveryMode,
        takeawayParcelChargeType: pricingProfileDraft.takeawayParcelChargeType,
        takeawayParcelChargeValue: pricingProfileDraft.takeawayParcelChargeValue,
        deliveryParcelChargeType: pricingProfileDraft.deliveryParcelChargeType,
        deliveryParcelChargeValue: pricingProfileDraft.deliveryParcelChargeValue,
        isActive: pricingProfileDraft.isActive
      };

      if (pricingProfileDraft.id) {
        await updatePricingProfile(pricingProfileDraft.id, payload);
        setSaveMessage("Pricing profile updated.");
      } else {
        await createPricingProfile(payload);
        setSaveMessage("Pricing profile created.");
      }

      const result = await reloadMenu();
      setPricingProfileDraft(buildDefaultPricingProfileDraft());
      setConfigDraft((current) => ({
        ...current,
        defaultPricingProfileId:
          result.menuConfig.defaultPricingProfileId || result.pricingProfiles?.find((profile) => profile.isActive)?.id || ""
      }));
    } catch (error) {
      setSaveError(error.message || "Unable to save pricing profile.");
    }
  }


  function startEditingGroup(menuGroup) {
    setGroupDraft({
      id: menuGroup.id,
      name: menuGroup.name,
      status: menuGroup.status,
      categoryIds: menuGroup.categoryIds || [],
      channels: menuGroup.channels,
      availability: menuGroup.availability,
      note: menuGroup.note || ""
    });
  }

  function cancelGroupEdit() {
    setGroupDraft(buildDefaultGroupDraft(menuData));
  }

  async function handleSaveMenuGroup(event) {
    event.preventDefault();

    try {
      setSaveError("");
      setSaveMessage("");
      const payload = {
        name: groupDraft.name,
        status: groupDraft.status,
        categoryIds: groupDraft.categoryIds,
        channels: groupDraft.channels,
        availability: groupDraft.availability,
        note: groupDraft.note
      };

      if (groupDraft.id) {
        await updateMenuGroup(groupDraft.id, payload);
        setSaveMessage("Menu group updated.");
      } else {
        await createMenuGroup(payload);
        setSaveMessage("Menu group created.");
      }

      const result = await reloadMenu();
      setGroupDraft(buildDefaultGroupDraft(result));
    } catch (error) {
      setSaveError(error.message || "Unable to save menu group.");
    }
  }

  function startEditingAssignment(assignment) {
    setAssignmentDraft({
      id: assignment.id,
      menuGroupId: assignment.menuGroupId,
      outletId: assignment.outletId,
      channels: assignment.channels,
      availability: assignment.availability,
      status: assignment.status
    });
  }

  function cancelAssignmentEdit() {
    setAssignmentDraft(buildDefaultAssignmentDraft(menuData));
  }

  async function handleSaveAssignment(event) {
    event.preventDefault();

    try {
      setSaveError("");
      setSaveMessage("");
      const payload = {
        menuGroupId: assignmentDraft.menuGroupId,
        outletId: assignmentDraft.outletId,
        channels: assignmentDraft.channels,
        availability: assignmentDraft.availability,
        status: assignmentDraft.status
      };

      if (assignmentDraft.id) {
        await updateMenuAssignment(assignmentDraft.id, payload);
        setSaveMessage("Outlet mapping updated.");
      } else {
        await createMenuAssignment(payload);
        setSaveMessage("Outlet mapping created.");
      }

      const result = await reloadMenu();
      setAssignmentDraft(buildDefaultAssignmentDraft(result));
    } catch (error) {
      setSaveError(error.message || "Unable to save outlet mapping.");
    }
  }

  function startEditingItem(item) {
    // Resolve base price — prefer explicit price/basePrice, then first pricing entry
    let base = item.price || item.basePrice || 0;
    if (!base && item.pricing?.length) {
      base = Number(String(item.pricing[0]?.dineIn || "0").replace(/[^\d.]/g, "")) || 0;
    }

    // Build areaOverrides from existing data — prefer stored areaOverrides,
    // otherwise derive from old pricing array entries that differ from base
    let areaOverrides = {};
    if (item.areaOverrides && Object.keys(item.areaOverrides).length) {
      areaOverrides = { ...item.areaOverrides };
    } else if (item.pricing?.length) {
      for (const entry of item.pricing) {
        const ep = Number(String(entry.dineIn || "0").replace(/[^\d.]/g, "")) || 0;
        if (ep !== Number(base)) areaOverrides[entry.area] = String(ep);
      }
    }

    setEditingItemId(item.id);
    setEditDraft({
      itemName:     item.name,
      categoryName: item.categoryName || menuData.categories.find((c) => c.id === item.categoryId)?.name || "",
      station:      item.station !== "Station pending" ? (item.station || "") : "",
      availableFrom: item.availableFrom || "",
      availableTo:   item.availableTo   || "",
      foodType:      item.foodType      || "Veg",
      unit:          item.unit          || "",
      trackInventory: item.inventoryTracking?.enabled ? "Enabled" : "Disabled",
      selectedAreas: (item.areaAvailability || []).filter((e) => e.enabled).map((e) => e.area),
      // Preserve outlet availability so editing never silently wipes branch restrictions
      outletAvailability: item.outletAvailability || [],
      // Preserve taxMode so editing an Inclusive item doesn't downgrade it to Exclusive
      taxMode: item.taxMode || "Exclusive",
      // New pricing model
      basePrice:    String(base),
      onlinePrice:  String(item.onlinePrice || 0),
      areaOverrides,
      takeawayPackingCharge: String(item.takeawayPackingCharge ?? item.parcelCharges?.takeaway?.value ?? 0),
      deliveryPackingCharge: String(item.deliveryPackingCharge ?? item.parcelCharges?.delivery?.value ?? 0),
      taxRate: String(item.taxRate ?? 5),
      // optional fields
      description:       item.description       || "",
      shortCode:         item.shortCode         || "",
      hsnCode:           item.hsnCode           || "",
      sku:               item.sku               || "",
      rank:              String(item.rank       ?? 999),
      exposeInCaptain:   item.exposeInCaptain   !== false,
      allowDecimalQty:   item.allowDecimalQty   === true,
      manufacturingDate: item.manufacturingDate || "",
      expiryDate:        item.expiryDate        || "",
      lowStockLevel:     item.lowStockLevel     ?? "",
    });
    setSaveError("");
    setSaveMessage("");
  }

  function cancelEditingItem() {
    setEditingItemId("");
    setEditDraft(null);
  }

  async function handleUpdateItem(itemId, event) {
    event.preventDefault();
    try {
      setSaveError("");
      setSaveMessage("");
      await updateCustomMenuItem(itemId, {
        ...editDraft,
        availableAreas,
        areaAvailability: editDraft.selectedAreas?.length
          ? editDraft.selectedAreas.map((name) => ({ area: name, enabled: true }))
          : [],
      });
      await reloadMenu();
      cancelEditingItem();
      setSaveMessage("Menu item updated.");
    } catch (error) {
      setSaveError(error.message || "Unable to update the item.");
    }
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(
      `Delete "${item.name}"?\n\n` +
      `⚠ If this item is currently in an open table order on POS, those screens will show an error.\n\n` +
      `Tip: mark the item as Sold Out instead of deleting during service hours.\n\n` +
      `Delete anyway? This cannot be undone.`
    )) {
      return;
    }

    try {
      setSaveError("");
      setSaveMessage("");
      await deleteCustomMenuItem(item.id);
      await reloadMenu();
      if (editingItemId === item.id) {
        cancelEditingItem();
      }
      setSaveMessage("Menu item deleted.");
    } catch (error) {
      setSaveError(error.message || "Unable to delete the item.");
    }
  }

  async function handleBulkDelete() {
    if (selectedItems.size === 0) return;
    if (!window.confirm(`Delete ${selectedItems.size} item${selectedItems.size > 1 ? "s" : ""}? This cannot be undone.`)) {
      return;
    }

    setBulkDeleting(true);
    setSaveError("");
    setSaveMessage("");

    let deletedCount = 0;
    const errors = [];

    for (const id of selectedItems) {
      try {
        await deleteCustomMenuItem(id);
        deletedCount++;
      } catch (err) {
        errors.push(id);
      }
    }

    await reloadMenu();
    setSelectedItems(new Set());
    setBulkDeleting(false);

    if (errors.length > 0) {
      setSaveError(`Deleted ${deletedCount} item${deletedCount !== 1 ? "s" : ""}. ${errors.length} failed.`);
    } else {
      setSaveMessage(`${deletedCount} item${deletedCount !== 1 ? "s" : ""} deleted.`);
    }
  }

  function toggleItemSelection(id) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll(filteredIds) {
    setSelectedItems((prev) => {
      const allSelected = filteredIds.every((id) => prev.has(id));
      if (allSelected) {
        // Deselect all filtered items
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      } else {
        // Select all filtered items
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      }
    });
  }

  function toggleInventoryTracking(itemId) {
    updateInventoryState((current) => ({
      ...current,
      diningItems: current.diningItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              trackingEnabled: !item.trackingEnabled,
              alert: !item.trackingEnabled
                ? "Track sellable stock for POS and waiter ordering"
                : "Inventory tracking is disabled for this item"
            }
          : item
      )
    }));
  }

  function toggleSalesAvailability(itemId) {
    updateMenuControls((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        salesAvailability: current[itemId]?.salesAvailability === "Sold Out" ? "Available" : "Sold Out"
      }
    }));
  }

  function toggleOutletAvailability(itemId, outletName) {
    updateMenuControls((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        outletAvailability: {
          ...((current[itemId] && current[itemId].outletAvailability) || {}),
          [outletName]: !current[itemId]?.outletAvailability?.[outletName]
        }
      }
    }));
  }

  async function handleAutoNumber() {
    if (!window.confirm(
      "This will assign sequential numbers (1, 2, 3...) to all items that don't have an item number.\n\nItems that already have a number will NOT be changed.\n\nContinue?"
    )) return;
    setAutoNumbering(true);
    try {
      const result = await api.post("/menu/auto-number");
      alert(`✅ Done! ${result.assigned} items numbered.`);
      await reloadMenu();
    } catch (err) {
      alert("Error: " + (err.message || "Failed to auto-number items"));
    } finally {
      setAutoNumbering(false);
    }
  }

  async function handleExportMenu() {
    try {
      setSaveError("");
      setSaveMessage("");

      const headers = [
        "itemName",
        "categoryName",
        "foodType",
        "acDineIn",
        "nonAcDineIn",
        "selfDineIn",
        "takeawayPrice",
        "deliveryPrice",
        "station",
        "salesAvailability"
      ];

      const rows = menuData.items.map((item) => [
        item.name,
        item.categoryName || "",
        item.foodType || "",
        priceValue(item.pricing, "AC", "dineIn"),
        priceValue(item.pricing, "Non-AC", "dineIn"),
        priceValue(item.pricing, "Self Service", "dineIn"),
        moneyValue(item.takeawayPrice),
        moneyValue(item.deliveryPrice),
        item.station || "",
        item.salesAvailability || "Available"
      ]);

      const csv = [headers.join(","), ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "menu-export.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaveMessage("Menu export downloaded.");
    } catch (error) {
      setSaveError(error.message || "Unable to export menu.");
    }
  }

  // ── Save field settings back to business profile ───────────────────────────
  async function handleSaveFieldSettings() {
    setFieldSettingsSaving(true);
    setFieldSettingsMsg("");
    try {
      await api.patch("/business-profile", { menuFieldSettings });
      setFieldSettingsMsg("Field settings saved.");
    } catch (_) {
      setFieldSettingsMsg("Failed to save. Please try again.");
    } finally {
      setFieldSettingsSaving(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Owner Setup • Menu</p>
          <h2>Menu & Categories</h2>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setShowImportPanel(true)}
          >
            Bulk Import
          </button>
          <button type="button" className="secondary-btn" onClick={handleExportMenu}>
            Export Menu
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleAutoNumber}
            disabled={autoNumbering}
            title="Assign sequential numbers (1, 2, 3...) to all items without an item number"
          >
            {autoNumbering ? "Numbering…" : "# Auto-number Items"}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Add Item
          </button>
        </div>
      </header>

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="menu-tab-nav">
        <button
          className={`menu-tab-btn${activeTab === "items" ? " active" : ""}`}
          onClick={() => setActiveTab("items")}
        >
          Menu Items
        </button>
        <button
          className={`menu-tab-btn${activeTab === "field-settings" ? " active" : ""}`}
          onClick={() => setActiveTab("field-settings")}
        >
          ⚙️ Field Settings
        </button>
      </div>

      {/* ── Field Settings tab ─────────────────────────────────────────────── */}
      {activeTab === "field-settings" && (
        <section className="dashboard-grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Menu Configuration</p>
                <h3>Optional Menu Fields</h3>
              </div>
            </div>
            <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "20px" }}>
              Enable only the fields your business needs. Enabled fields appear in the Add Item form, Edit Item form, and Bulk Import CSV template.
              You can also set these from <strong>Business Profile → Business Type</strong>.
            </p>
            <div className="mfs-grid">
              {Object.entries(MENU_FIELD_LABELS).map(([key, label]) => (
                <div key={key} className="mfs-row mfs-row--detailed">
                  <div className="mfs-row-text">
                    <span className="mfs-label">{label}</span>
                    <span className="mfs-desc">{MENU_FIELD_DESCRIPTIONS[key]}</span>
                  </div>
                  <button
                    type="button"
                    className={`mfs-toggle${menuFieldSettings[key] ? " mfs-toggle--on" : ""}`}
                    onClick={() => setMenuFieldSettings((cur) => ({ ...cur, [key]: !cur[key] }))}
                  >
                    {menuFieldSettings[key] ? "ON" : "OFF"}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                className="primary-btn"
                onClick={handleSaveFieldSettings}
                disabled={fieldSettingsSaving}
              >
                {fieldSettingsSaving ? "Saving…" : "Save Field Settings"}
              </button>
              {fieldSettingsMsg && (
                <span style={{ fontSize: "13px", color: fieldSettingsMsg.includes("Failed") ? "#dc2626" : "#059669" }}>
                  {fieldSettingsMsg}
                </span>
              )}
            </div>
          </article>
        </section>
      )}

      {/* ── All existing content — only show on items tab ──────────────────── */}
      {activeTab === "items" && <>

      <section className="hero-panel menu-hero">
        <div>
          <p className="hero-label">Menu-first operations</p>
          <h3>Build a fast, clean menu before the POS goes live</h3>
        </div>

        <div className="hero-stats">
          <div>
            <span>Categories</span>
            <strong>{categoryCount}</strong>
          </div>
          <div>
            <span>Items active</span>
            <strong>{itemCount}</strong>
          </div>
          <div>
            <span>Needs review</span>
            <strong className="negative">{reviewCount}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Pricing profiles</span>
          <strong>{availablePricingProfiles.length}</strong>
          <p>Active pricing rules available for dine-in, takeaway, and delivery</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Veg items</span>
          <strong>{vegItemCount}</strong>
          <p>Items currently marked as veg in the live menu data</p>
        </article>
        <article
          className={`metric-card warning${missingTaxCount > 0 ? " metric-card-clickable" : ""}`}
          onClick={() => { if (missingTaxCount > 0) { setTaxFilter("Missing"); setActiveTab("items"); } }}
          title={missingTaxCount > 0 ? "Click to filter items missing a GST rate" : undefined}
        >
          <span className="metric-label">Missing GST</span>
          <strong>{missingTaxCount}</strong>
          <p>{missingTaxCount > 0 ? "Click to view & fix these items" : "All items have a GST rate ✓"}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Kitchen mapped</span>
          <strong>{kitchenMappedCount}</strong>
          <p>{missingStationCount} items still need station assignment</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Inventory tracking</span>
          <strong>{inventoryTrackedCount}</strong>
          <p>Items currently tracked in inventory</p>
        </article>
      </section>

      <section className={`panel menu-library-shell ${showFilterPanel ? "with-filters" : ""}`}>
        <div className="menu-library-main">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Item Library</p>
              <h3>Menu Items</h3>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Create Item
              </button>
            </div>
          </div>

          {/* ── Outlet filter chips (only when 2+ outlets exist) ────────── */}
          {availableOutlets.length > 1 && (
            <div className="outlet-filter-bar">
              <span className="outlet-filter-label">Branch</span>
              <div className="outlet-filter-chips">
                <button
                  type="button"
                  className={`outlet-filter-chip${outletFilter === "all" ? " active" : ""}`}
                  onClick={() => { setOutletFilter("all"); setCategoryFilter("All"); setCategorySelectedOutlets([]); }}
                >
                  All Outlets
                  <span className="outlet-filter-count">{menuData.items.length}</span>
                </button>
                {availableOutlets.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`outlet-filter-chip${outletFilter === o.name ? " active" : ""}`}
                    onClick={() => { setOutletFilter(o.name); setCategoryFilter("All"); setCategorySelectedOutlets([o.name]); }}
                  >
                    {o.name}
                    <span className="outlet-filter-count">{outletItemCounts[o.name] ?? 0}</span>
                  </button>
                ))}
              </div>
              {outletFilter !== "all" && (
                <span className="outlet-filter-hint">
                  Showing items available at <strong>{outletFilter}</strong>
                </span>
              )}
            </div>
          )}

          <div className="menu-library-toolbar">
            <input
              type="search"
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Search"
            />
            <button type="button" className="ghost-btn" onClick={printScaleSheet}
              title="Print PLU reference sheet for weight scale technician">
              ⚖️ Scale Sheet
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowFilterPanel(true)}>
              Category {categoryFilter !== "All" ? categoryFilter : ""}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowFilterPanel(true)}>
              Status {statusFilter}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowFilterPanel((current) => !current)}>
              All filters
            </button>
          </div>

          {selectedItems.size > 0 && (
            <div className="bulk-action-bar">
              <span className="bulk-action-count">{selectedItems.size} item{selectedItems.size > 1 ? "s" : ""} selected</span>
              <button
                type="button"
                className="danger-btn"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Deleting…" : `Delete ${selectedItems.size} item${selectedItems.size > 1 ? "s" : ""}`}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSelectedItems(new Set())}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Tax rate warning banner ──────────────────────────────────── */}
          {missingTaxCount > 0 && (
            <div className="tax-audit-banner">
              <span className="tax-audit-icon">⚠️</span>
              <div className="tax-audit-body">
                <strong>{missingTaxCount} item{missingTaxCount !== 1 ? "s" : ""} have no GST rate set.</strong>
                {" "}They will be billed at <strong>5% by default</strong> until fixed. This can cause incorrect GST filings.
              </div>
              {taxFilter !== "Missing" ? (
                <button className="tax-audit-btn" onClick={() => setTaxFilter("Missing")}>
                  Show only missing
                </button>
              ) : (
                <button className="tax-audit-btn" onClick={() => setTaxFilter("Any")}>
                  Show all items
                </button>
              )}
            </div>
          )}

          <div className="menu-library-table">
            {/* ── Table header ───────────────────────────────────────────── */}
            <div className="menu-library-row head" style={{
              gridTemplateColumns: "32px 60px 1fr 160px 130px 90px 80px 100px 120px 180px",
            }}>
              <span className="col-check">
                <input
                  type="checkbox"
                  title="Select all on this page"
                  checked={pagedItems.length > 0 && pagedItems.every((item) => selectedItems.has(item.id))}
                  onChange={() => toggleSelectAll(pagedItems.map((item) => item.id))}
                />
              </span>
              <span>Item #</span>
              <span>Item</span>
              <span>Category</span>
              <span>Sold In</span>
              <span>Base ₹</span>
              <span>Online ₹</span>
              <span>GST %</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {/* ── Rows + inline accordion ────────────────────────────────── */}
            {pagedItems.map((item) => {
              const isEditing     = editingItemId === item.id;
              const hasAreaPricing = item.areaOverrides && Object.values(item.areaOverrides).some(v => Number(v) > 0);
              const baseDisplay   = item.price || item.basePrice || 0;
              const onlineDisplay = item.onlinePrice || 0;

              return (
                <div key={`library-${item.id}`}>
                  {/* ── Item row ─────────────────────────────────────────── */}
                  <div
                    className={`menu-library-row${selectedItems.has(item.id) ? " row-selected" : ""}${isEditing ? " row-editing" : ""}`}
                    style={{
                      gridTemplateColumns: "32px 60px 1fr 160px 130px 90px 80px 100px 120px 180px",
                      borderBottom: isEditing ? "none" : undefined,
                      background: isEditing ? "#fffdf5" : undefined,
                    }}
                  >
                    <span className="col-check">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                      />
                    </span>

                    {/* Item # */}
                    <span style={{ fontWeight: 600, fontSize: 13, color: item.sku ? "#111827" : "#f59e0b" }}>
                      {item.sku || "—"}
                    </span>

                    {/* Name */}
                    <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
                      <strong style={{ fontSize: 14 }}>{item.name}</strong>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                        background: item.foodType === "Non-Veg" ? "#fee2e2" : item.foodType === "Egg" ? "#fef3c7" : "#dcfce7",
                        color:      item.foodType === "Non-Veg" ? "#991b1b" : item.foodType === "Egg" ? "#92400e" : "#166534",
                      }}>
                        {item.foodType === "Non-Veg" ? "NON-VEG" : item.foodType === "Egg" ? "EGG" : "VEG"}
                      </span>
                      {item.unit && <span className="unit-badge">{item.unit}</span>}
                      {(item.taxRate === null || item.taxRate === undefined || item.taxRate === "") && (
                        <span className="tax-missing-badge" title="No GST rate set">⚠️ GST</span>
                      )}
                      {hasAreaPricing && (
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 10,
                          background: "#ede9fe", color: "#6d28d9", fontWeight: 600,
                        }} title="Has area-specific pricing">
                          🏷 Area pricing
                        </span>
                      )}
                    </span>

                    {/* Category */}
                    <span style={{ color: "#6b7280", fontSize: 13 }}>
                      {item.categoryName || "Unassigned"}
                    </span>

                    {/* Sold In — read-only; use Edit to change */}
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(() => {
                        const enabledAreas = (item.areaAvailability || []).filter((e) => e.enabled).map((e) => e.area);
                        const labels = enabledAreas.length ? enabledAreas : ["All"];
                        return labels.map((label) => (
                          <span key={label} style={{
                            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                            background: "#eef2ff", color: "#4338ca",
                          }}>
                            {label}
                          </span>
                        ));
                      })()}
                    </span>

                    {/* Base price */}
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {baseDisplay > 0 ? `₹${baseDisplay}` : <span style={{ color: "#f59e0b" }}>—</span>}
                    </span>

                    {/* Online price */}
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      {onlineDisplay > 0 ? `₹${onlineDisplay}` : "—"}
                    </span>

                    {/* GST % */}
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      {item.taxRate != null && item.taxRate !== "" ? `${item.taxRate}%` : "—"}
                    </span>

                    {/* Status */}
                    <span>
                      <button
                        type="button"
                        className={`status status-pill ${item.salesAvailability === "Sold Out" ? "warning" : "online"}`}
                        onClick={() => toggleSalesAvailability(item.id)}
                      >
                        {item.salesAvailability === "Sold Out" ? "Sold out" : "Available"}
                      </button>
                    </span>

                    {/* Actions */}
                    <span className="entity-actions">
                      <button
                        type="button"
                        className="ghost-chip"
                        style={isEditing ? { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" } : {}}
                        onClick={() => isEditing ? cancelEditingItem() : startEditingItem(item)}
                      >
                        {isEditing ? "✕ Close" : "Edit"}
                      </button>
                      <button type="button" className="ghost-chip label-chip"
                        onClick={() => setLabelItem(item)} title="Print barcode stickers">
                        🏷️
                      </button>
                      <button type="button" className="ghost-chip"
                        onClick={() => handleDeleteItem(item)}>
                        Delete
                      </button>
                    </span>
                  </div>

                  {/* ── Inline accordion edit form ────────────────────────── */}
                  {isEditing && editDraft && (
                    <div style={{
                      background: "#fffdf5",
                      border: "1.5px solid #fde68a",
                      borderTop: "none",
                      borderRadius: "0 0 10px 10px",
                      padding: "20px 24px 24px",
                      marginBottom: 4,
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", marginBottom: 16,
                      }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", margin: 0 }}>
                          ✏️ Editing: <span style={{ color: "#111827" }}>{editDraft.itemName}</span>
                        </p>
                        <button type="button" className="ghost-chip"
                          onClick={cancelEditingItem}
                          style={{ color: "#6b7280", fontSize: 12 }}>
                          ✕ Cancel edit
                        </button>
                      </div>
                      <ItemForm
                        mode="edit"
                        draft={editDraft}
                        onChange={(key, value) => setEditDraft((cur) => ({ ...cur, [key]: value }))}
                        onSubmit={(e) => handleUpdateItem(editingItemId, e)}
                        onCancel={cancelEditingItem}
                        menuFieldSettings={menuFieldSettings}
                        availableCategoryNames={availableCategoryNames}
                        availableStationNames={availableStationNames}
                        availableAreas={availableAreas}
                        nextScalePlu={nextScalePlu}
                        saveMessage={saveMessage}
                        saveError={saveError}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination bar ── */}
          {filteredLibraryItems.length > ITEMS_PER_PAGE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px 4px", borderTop: "1px solid #f0ede6", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                Showing {(itemPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(itemPage * ITEMS_PER_PAGE, filteredLibraryItems.length)} of {filteredLibraryItems.length} items
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ padding: "5px 14px", fontSize: 13 }}
                  disabled={itemPage === 1}
                  onClick={() => setItemPage((p) => p - 1)}
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - itemPage) <= 1)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "…" ? (
                      <span key={`ellipsis-${idx}`} style={{ fontSize: 13, color: "#9ca3af", padding: "0 4px" }}>…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setItemPage(p)}
                        style={{
                          padding: "5px 11px", fontSize: 13, borderRadius: 6, cursor: "pointer",
                          border: p === itemPage ? "1.5px solid #059669" : "1.5px solid #e5e7eb",
                          background: p === itemPage ? "#059669" : "#fff",
                          color: p === itemPage ? "#fff" : "#374151",
                          fontWeight: p === itemPage ? 700 : 400,
                        }}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ padding: "5px 14px", fontSize: 13 }}
                  disabled={itemPage === totalPages}
                  onClick={() => setItemPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {showFilterPanel ? (
          <aside className="menu-filter-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Filter by</p>
                <h3>Menu Filters</h3>
              </div>
              <div className="entity-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setCategoryFilter("All");
                    setStatusFilter("Active");
                    setInventoryFilter("Any");
                    setFoodTypeFilter("Any");
                    setOutletFilter("all");
                    setUnitFilter("Any");
                    setBulkUnit("");
                  }}
                >
                  Reset
                </button>
                <button type="button" className="primary-btn" onClick={() => setShowFilterPanel(false)}>
                  Apply
                </button>
              </div>
            </div>

            <div className="simple-form">
              {availableOutlets.length > 1 && (
                <label>
                  Branch / Outlet
                  <select value={outletFilter} onChange={(event) => { setOutletFilter(event.target.value); setCategoryFilter("All"); }}>
                    <option value="all">All Outlets</option>
                    {availableOutlets.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name} ({outletItemCounts[o.name] ?? 0} items)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Category
                {outletFilter !== "all" && (
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400, marginLeft: 6 }}>
                    ({filteredCategoryNames.length} in this branch)
                  </span>
                )}
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="All">All</option>
                  {filteredCategoryNames.map((categoryNameOption) => (
                    <option key={`filter-${categoryNameOption}`} value={categoryNameOption}>
                      {categoryNameOption}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>Active</option>
                  <option>Sold Out</option>
                  <option>All</option>
                </select>
              </label>
              <label>
                Inventory
                <select value={inventoryFilter} onChange={(event) => setInventoryFilter(event.target.value)}>
                  <option>Any</option>
                  <option>Tracked</option>
                  <option>Not tracked</option>
                </select>
              </label>
              <label>
                Item type
                <select value={foodTypeFilter} onChange={(event) => setFoodTypeFilter(event.target.value)}>
                  <option>Any</option>
                  <option>Veg</option>
                  <option>Non-Veg</option>
                </select>
              </label>
              <label>
                Sold by
                <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
                  <option value="Any">Any</option>
                  <option value="KG">KG — per kilogram</option>
                  <option value="LTR">LTR — per litre</option>
                  <option value="G">G — per gram</option>
                  <option value="ML">ML — per millilitre</option>
                  <option value="PCS">Per piece (no unit set)</option>
                </select>
              </label>

              {/* ── Bulk assign unit — only when a specific category is selected ── */}
              {categoryFilter !== "All" && (
                <div style={{ marginTop: 8, padding: 12, background: "var(--surface-secondary, #f9fafb)", borderRadius: 8, border: "1px solid var(--border-subtle, #e5e7eb)" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Set "Sold by" for entire category
                  </p>
                  <select
                    value={bulkUnit}
                    onChange={(e) => setBulkUnit(e.target.value)}
                    style={{ width: "100%", marginBottom: 8 }}
                  >
                    <option value="">— Choose unit —</option>
                    <option value="KG">KG — per kilogram</option>
                    <option value="LTR">LTR — per litre</option>
                    <option value="G">G — per gram</option>
                    <option value="ML">ML — per millilitre</option>
                    <option value="PCS">Per piece</option>
                  </select>
                  {bulkUnit && (
                    <button
                      type="button"
                      className="primary-btn"
                      style={{ width: "100%" }}
                      onClick={handleBulkSetUnit}
                      disabled={bulkUnitSaving}
                    >
                      {bulkUnitSaving
                        ? "Saving…"
                        : `Set all "${categoryFilter}" items to ${bulkUnit === "PCS" ? "Per Piece" : bulkUnit}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </section>

      <section className="dashboard-grid menu-layout">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Categories</p>
              <h3>Category List</h3>
            </div>
            {editingCategoryId && (
              <button type="button" className="ghost-btn" onClick={cancelEditingCategory}>
                Cancel Edit
              </button>
            )}
          </div>

          {/* ── Add category (single compact row) ── */}
          <form onSubmit={handleCreateCategory} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px", minWidth: 120 }}>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="New category name…"
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1.5px solid #d1d5db", fontSize: 13 }}
                />
              </div>
              <button type="submit" className="primary-btn" style={{ whiteSpace: "nowrap", padding: "7px 16px" }}>
                + Add
              </button>
            </div>
            {availableOutlets.length > 1 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Branch:</span>
                <label className={`menu-outlet-chip${!categorySelectedOutlets.length ? " selected" : ""}`}>
                  <input type="radio" name="newCategoryOutletScope" checked={!categorySelectedOutlets.length}
                    onChange={() => {
                      setCategorySelectedOutlets([]);
                      setCategoryListOutletFilter("all");
                    }} />
                  <span>✓ All branches</span>
                </label>
                {availableOutlets.map((outlet) => {
                  const checked = categorySelectedOutlets.length === 1 && categorySelectedOutlets[0] === outlet.name;
                  return (
                    <label key={outlet.id || outlet.name} className={`menu-outlet-chip${checked ? " selected" : ""}`}>
                      <input type="radio" name="newCategoryOutletScope" checked={checked}
                        onChange={() => {
                          setCategorySelectedOutlets([outlet.name]);
                          setCategoryListOutletFilter(outlet.name);
                        }} />
                      <span>{outlet.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </form>

          {/* ── Scrollable category list ── */}
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {categoryGroups.length === 0 && (
              <p style={{ color: "#9ca3af", fontSize: 13, padding: "8px 0" }}>No categories yet — add one above.</p>
            )}
            {categoryGroups.length > 0 && filteredCategoryGroups.length === 0 && (
              <p style={{ color: "#9ca3af", fontSize: 13, padding: "8px 0" }}>
                No categories assigned to <strong>{categoryListOutletFilter}</strong> yet.
              </p>
            )}
            {categoryGroupsByOutlet.map(({ outlet, categories: outletCategories }) => (
              <div key={outlet.id || outlet.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
                  letterSpacing: "0.04em", padding: "6px 2px 2px"
                }}>
                  {outlet.name} <span style={{ fontWeight: 400, color: "#9ca3af", textTransform: "none" }}>({outletCategories.length})</span>
                </div>
                {outletCategories.length === 0 && (
                  <p style={{ color: "#9ca3af", fontSize: 12, padding: "0 2px 4px" }}>No categories at this branch yet.</p>
                )}
                {outletCategories.map((category) => {
              const headerOutletName = outlet.id === "__none__" ? "" : outlet.name;
              const isEditingHere = editingCategoryId === category.id && editingCategoryOutletName === headerOutletName;
              const areasForThisOutlet = workAreasForOutlet(headerOutletName);
              return (
              <div key={category.id} style={{
                background: isEditingHere ? "#fffbeb" : "#f9f9f7",
                border: isEditingHere ? "1.5px solid #fde68a" : "1.5px solid #e5e7eb",
                borderRadius: 8, padding: "8px 12px"
              }}>
                {isEditingHere ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      type="text"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: "1.5px solid #d1d5db", fontSize: 13 }}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>Available</span>
                      <input type="time" value={editingCategoryAvailableFrom}
                        onChange={(e) => setEditingCategoryAvailableFrom(e.target.value)}
                        style={{ fontSize: 12, padding: "3px 6px", borderRadius: 5, border: "1px solid #d1d5db" }} />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>–</span>
                      <input type="time" value={editingCategoryAvailableTo}
                        onChange={(e) => setEditingCategoryAvailableTo(e.target.value)}
                        style={{ fontSize: 12, padding: "3px 6px", borderRadius: 5, border: "1px solid #d1d5db" }} />
                    </div>
                    {areasForThisOutlet.length > 0 && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>
                          Sold in{headerOutletName ? ` (${headerOutletName})` : ""}:
                        </span>
                        <label className={`menu-outlet-chip${!editingCategorySelectedAreas.length ? " selected" : ""}`}>
                          <input type="radio" name="editCategoryAreaScope" checked={!editingCategorySelectedAreas.length}
                            onChange={() => setEditingCategorySelectedAreas([])} />
                          <span>✓ All areas</span>
                        </label>
                        {areasForThisOutlet.map((area) => {
                          const checked = editingCategorySelectedAreas.includes(area);
                          return (
                            <label key={area} className={`menu-outlet-chip${checked ? " selected" : ""}`}>
                              <input type="checkbox" checked={checked}
                                onChange={(e) => setEditingCategorySelectedAreas((cur) =>
                                  e.target.checked ? [...cur, area] : cur.filter((a) => a !== area)
                                )} />
                              <span>{area}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
                      <input type="checkbox" checked={editingCategoryOnline}
                        onChange={(e) => setEditingCategoryOnline(e.target.checked)} />
                      List on Swiggy/Zomato
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="primary-btn" style={{ padding: "4px 12px", fontSize: 12 }}
                        onClick={() => handleSaveCategoryEdit(category)}>
                        Save
                      </button>
                      <button type="button" className="ghost-btn" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={cancelEditingCategory}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{category.name}</strong>
                      {(category.availableFrom || category.availableTo) && (
                        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                          {category.availableFrom}–{category.availableTo}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                        {category.items?.length || 0} items
                      </span>
                      {(category.areaAvailability || []).find((e) => e.area === "Online" && e.enabled) && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                          background: "#fef3c7", color: "#92400e", marginLeft: 8,
                        }} title="Visible on Swiggy/Zomato">
                          🛵 Online
                        </span>
                      )}
                      {availableAreas.length > 1 && (() => {
                        const perOutletAreas = headerOutletName ? category.areaByOutlet?.[headerOutletName] : null;
                        const displayAreas = perOutletAreas || category.areaAvailability || [];
                        const enabledAreas = displayAreas.filter((e) => e.enabled).map((e) => e.area);
                        return (
                          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                            · {enabledAreas.length ? enabledAreas.join(", ") : "All areas"}
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="ghost-chip" onClick={() => startEditingCategory(category, headerOutletName)}>Edit</button>
                      <button type="button" className="ghost-chip" onClick={() => handleDeleteCategory(category)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
              );
                })}
              </div>
            ))}
          </div>
        </article>

        <article ref={formRef} className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Quick Create</p>
              <h3>New Item</h3>
            </div>
          </div>
          <ItemForm
            mode="create"
            draft={itemDraft}
            onChange={updateItemDraft}
            onSubmit={handleSaveItem}
            menuFieldSettings={menuFieldSettings}
            availableCategoryNames={availableCategoryNames}
            availableStationNames={availableStationNames}
            availableOutlets={availableOutlets}
            availableAreas={availableAreas}
            nextScalePlu={nextScalePlu}
            saveMessage={saveMessage}
            saveError={saveError}
          />
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Kitchen Setup</p>
              <h3>Kitchen Stations</h3>
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateStation}>
            <label>
              New kitchen station
              <input
                type="text"
                value={stationName}
                onChange={(event) => setStationName(event.target.value)}
                placeholder="Tandoor station"
              />
            </label>
            <button type="submit" className="secondary-btn full-width">
              Add New Station
            </button>
          </form>

          <div className="mini-stack">
            {menuData.stations.map((station) => (
              <div key={station.id} className="mini-card">
                <span>Station</span>
                <strong>{station.name}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Pending Tasks</p>
              <h3>Menu Cleanup</h3>
            </div>
          </div>

          <div className="alert-list">
            {dynamicAlerts.map((alert) => (
              <div key={alert.id} className="alert-item">
                <strong>{alert.title}</strong>
                <span>{alert.description}</span>
              </div>
            ))}
            {dynamicAlerts.length === 0 ? (
              <div className="alert-item">
                <strong>No pending menu cleanup items</strong>
                <span>Tax, pricing, and kitchen mapping are currently in a good state.</span>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      </> /* end activeTab === "items" */}

      {/* ── Bulk Import Panel ─────────────────────────────────────────────── */}
      {showImportPanel && (
        <BulkImportPanel
          onClose={() => setShowImportPanel(false)}
          onImportDone={() => reloadMenu()}
          menuFieldSettings={menuFieldSettings}
          availableOutlets={availableOutlets}
        />
      )}

      {/* ── Label Print Modal ─────────────────────────────────────────────── */}
      {labelItem && (
        <LabelPrintModal
          item={labelItem}
          onClose={() => setLabelItem(null)}
        />
      )}
    </>
  );
}
