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
  updatePricingProfile
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
  manufacturingDate: false, expiryDate: false, sku: false,
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
    itemName: "", categoryName: menuData.categories[0]?.name || "",
    foodType: "Veg", unit: "",
    acDineIn: "0", nonAcDineIn: "0", selfDineIn: "0",
    takeawayPrice: "0", deliveryPrice: "0",
    taxMode: "Exclusive", taxRate: "5",
    takeawayParcelChargeType: "None", takeawayParcelChargeValue: "0",
    deliveryParcelChargeType: "None", deliveryParcelChargeValue: "0",
    availableFrom: "", availableTo: "",
    trackInventory: "Disabled", entryStyle: "Optional later",
    selectedOutlets: [],
    // optional fields
    description: "", shortCode: "", hsnCode: "", sku: "",
    rank: "999", packingCharges: "0",
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
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryAvailableFrom, setEditingCategoryAvailableFrom] = useState("");
  const [editingCategoryAvailableTo, setEditingCategoryAvailableTo] = useState("");
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
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [outletFilter, setOutletFilter] = useState("all"); // "all" | outlet name
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
    (item) =>
      Number(priceValue(item.pricing, "AC", "dineIn")) <= 0 ||
      Number(priceValue(item.pricing, "Non-AC", "dineIn")) <= 0 ||
      Number(priceValue(item.pricing, "Self Service", "dineIn")) <= 0
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
  const availableStationNames = menuData.stations.map((station) => station.name);
  const availableOutlets = menuData.outlets || [];
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
      (item.categoryName || "").toLowerCase().includes(librarySearch.toLowerCase());
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
    // Outlet filter: "all" shows everything; specific outlet shows only enabled items
    const matchesOutlet =
      outletFilter === "all" ||
      (item.outletAvailability || []).length === 0 || // no data = available everywhere
      (item.outletAvailability || []).some(
        (entry) => entry.outlet === outletFilter && entry.enabled
      );

    return matchesSearch && matchesCategory && matchesStatus && matchesInventory && matchesFoodType && matchesTax && matchesOutlet;
  });

  function updateItem(itemId, updater) {
    setMenuData((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? updater(item) : item))
    }));
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
        itemName:                  itemDraft.itemName,
        categoryName:              itemDraft.categoryName,
        availableFrom:             itemDraft.availableFrom,
        availableTo:               itemDraft.availableTo,
        acDineIn:                  itemDraft.acDineIn,
        nonAcDineIn:               itemDraft.nonAcDineIn,
        selfDineIn:                itemDraft.selfDineIn,
        takeawayPrice:             itemDraft.takeawayPrice,
        deliveryPrice:             itemDraft.deliveryPrice,
        taxMode:                   itemDraft.taxMode,
        taxRate:                   itemDraft.taxRate,
        takeawayParcelChargeType:  itemDraft.takeawayParcelChargeType,
        takeawayParcelChargeValue: itemDraft.takeawayParcelChargeValue,
        deliveryParcelChargeType:  itemDraft.deliveryParcelChargeType,
        deliveryParcelChargeValue: itemDraft.deliveryParcelChargeValue,
        station:                   "",
        trackInventory:            itemDraft.trackInventory,
        entryStyle:                itemDraft.entryStyle,
        foodType:                  itemDraft.foodType,
        unit:                      itemDraft.unit || "",
        outletAvailability:        itemDraft.selectedOutlets?.length
          ? itemDraft.selectedOutlets.map((name) => ({ outlet: name, enabled: true }))
          : availableOutlets.map((o) => ({ outlet: o.name, enabled: true })),
        // optional fields
        description:       itemDraft.description,
        shortCode:         itemDraft.shortCode,
        hsnCode:           itemDraft.hsnCode,
        sku:               itemDraft.sku,
        rank:              itemDraft.rank,
        packingCharges:    itemDraft.packingCharges,
        exposeInCaptain:   itemDraft.exposeInCaptain,
        allowDecimalQty:   itemDraft.allowDecimalQty,
        manufacturingDate: itemDraft.manufacturingDate,
        expiryDate:        itemDraft.expiryDate,
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
        availableTo: categoryAvailableTo
      });
      setCategoryName("");
      setCategoryAvailableFrom("10:00");
      setCategoryAvailableTo("16:00");
      await reloadMenu();
      form.reset();
      setSaveMessage("New category created.");
    } catch (error) {
      setSaveError(error.message || "Unable to create category.");
    }
  }

  function startEditingCategory(category) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingCategoryAvailableFrom(category.availableFrom || "");
    setEditingCategoryAvailableTo(category.availableTo || "");
    setSaveError("");
    setSaveMessage("");
  }

  function cancelEditingCategory() {
    setEditingCategoryId("");
    setEditingCategoryName("");
    setEditingCategoryAvailableFrom("");
    setEditingCategoryAvailableTo("");
  }

  async function handleSaveCategoryEdit(category) {
    if (!editingCategoryName.trim()) {
      setSaveError("Category name is required.");
      return;
    }

    try {
      setSaveError("");
      setSaveMessage("");
      await updateMenuCategory(category.id, {
        name: editingCategoryName.trim(),
        availableFrom: editingCategoryAvailableFrom,
        availableTo: editingCategoryAvailableTo
      });
      await reloadMenu();
      cancelEditingCategory();
      setSaveMessage("Category updated.");
    } catch (error) {
      setSaveError(error.message || "Unable to update category.");
    }
  }

  async function handleDeleteCategory(category) {
    if (!window.confirm(`Delete category ${category.name}? Items under this category will also be removed.`)) {
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
    setEditingItemId(item.id);
    setEditDraft({
      itemName:     item.name,
      categoryName: item.categoryName || menuData.categories.find((c) => c.id === item.categoryId)?.name || "",
      station:      item.station      || "",
      availableFrom: item.availableFrom || "",
      availableTo:   item.availableTo   || "",
      foodType:      item.foodType      || "Veg",
      unit:          item.unit          || "",
      trackInventory: item.inventoryTracking.enabled ? "Enabled" : "Disabled",
      entryStyle:     item.inventoryTracking.mode    || "Item wise",
      acDineIn:     priceValue(item.pricing, "AC", "dineIn"),
      nonAcDineIn:  priceValue(item.pricing, "Non-AC", "dineIn"),
      selfDineIn:   priceValue(item.pricing, "Self Service", "dineIn"),
      takeawayPrice: moneyValue(item.takeawayPrice || item.pricing?.[0]?.takeaway),
      deliveryPrice: moneyValue(item.deliveryPrice || item.pricing?.[0]?.delivery),
      taxMode: item.taxMode || "Exclusive",
      taxRate: String(item.taxRate || 0),
      takeawayParcelChargeType:  item.parcelCharges?.takeaway?.type  || "None",
      takeawayParcelChargeValue: String(item.parcelCharges?.takeaway?.value || 0),
      deliveryParcelChargeType:  item.parcelCharges?.delivery?.type  || "None",
      deliveryParcelChargeValue: String(item.parcelCharges?.delivery?.value || 0),
      // optional fields
      description:       item.description       || "",
      shortCode:         item.shortCode         || "",
      hsnCode:           item.hsnCode           || "",
      sku:               item.sku               || "",
      rank:              String(item.rank       ?? 999),
      packingCharges:    String(item.packingCharges ?? 0),
      exposeInCaptain:   item.exposeInCaptain   !== false,
      allowDecimalQty:   item.allowDecimalQty   === true,
      manufacturingDate: item.manufacturingDate || "",
      expiryDate:        item.expiryDate        || "",
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
        itemName:                  editDraft.itemName,
        categoryName:              editDraft.categoryName,
        availableFrom:             editDraft.availableFrom,
        availableTo:               editDraft.availableTo,
        acDineIn:                  editDraft.acDineIn,
        nonAcDineIn:               editDraft.nonAcDineIn,
        selfDineIn:                editDraft.selfDineIn,
        takeawayPrice:             editDraft.takeawayPrice,
        deliveryPrice:             editDraft.deliveryPrice,
        taxMode:                   editDraft.taxMode,
        taxRate:                   editDraft.taxRate,
        takeawayParcelChargeType:  editDraft.takeawayParcelChargeType,
        takeawayParcelChargeValue: editDraft.takeawayParcelChargeValue,
        deliveryParcelChargeType:  editDraft.deliveryParcelChargeType,
        deliveryParcelChargeValue: editDraft.deliveryParcelChargeValue,
        station:                   editDraft.station,
        trackInventory:            editDraft.trackInventory,
        entryStyle:                editDraft.entryStyle,
        foodType:                  editDraft.foodType,
        unit:                      editDraft.unit || "",
        // optional fields
        description:       editDraft.description,
        shortCode:         editDraft.shortCode,
        hsnCode:           editDraft.hsnCode,
        sku:               editDraft.sku,
        rank:              editDraft.rank,
        packingCharges:    editDraft.packingCharges,
        exposeInCaptain:   editDraft.exposeInCaptain,
        allowDecimalQty:   editDraft.allowDecimalQty,
        manufacturingDate: editDraft.manufacturingDate,
        expiryDate:        editDraft.expiryDate,
      });
      await reloadMenu();
      cancelEditingItem();
      setSaveMessage("Menu item updated.");
    } catch (error) {
      setSaveError(error.message || "Unable to update the item.");
    }
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) {
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
                  onClick={() => setOutletFilter("all")}
                >
                  All Outlets
                  <span className="outlet-filter-count">{menuData.items.length}</span>
                </button>
                {availableOutlets.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`outlet-filter-chip${outletFilter === o.name ? " active" : ""}`}
                    onClick={() => setOutletFilter(o.name)}
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
            <div className="menu-library-row head">
              <span className="col-check">
                <input
                  type="checkbox"
                  title="Select all"
                  checked={filteredLibraryItems.length > 0 && filteredLibraryItems.every((item) => selectedItems.has(item.id))}
                  onChange={() => toggleSelectAll(filteredLibraryItems.map((item) => item.id))}
                />
              </span>
              <span>Item</span>
              <span>Reporting category</span>
              <span>Status</span>
              <span>Price</span>
              <span>Actions</span>
            </div>
            {filteredLibraryItems.map((item) => (
              <div key={`library-${item.id}`} className={`menu-library-row${selectedItems.has(item.id) ? " row-selected" : ""}`}>
                <span className="col-check">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleItemSelection(item.id)}
                  />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  {item.unit && (
                    <span className="unit-badge">{item.unit}</span>
                  )}
                  {(item.taxRate === null || item.taxRate === undefined || item.taxRate === "") && (
                    <span className="tax-missing-badge" title="No GST rate set — will default to 5%">⚠️ GST</span>
                  )}
                </span>
                <span>{item.categoryName || "Unassigned"}</span>
                <span>
                  <button
                    type="button"
                    className={`status status-pill ${item.salesAvailability === "Sold Out" ? "warning" : "online"}`}
                    onClick={() => toggleSalesAvailability(item.id)}
                  >
                    {item.salesAvailability === "Sold Out" ? "Sold out" : "Available"}
                  </button>
                </span>
                <span>{item.pricing?.[0]?.dineIn || item.takeawayPrice}</span>
                <span className="entity-actions">
                  <button type="button" className="ghost-chip" onClick={() => startEditingItem(item)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-chip label-chip" onClick={() => setLabelItem(item)} title="Print barcode stickers">
                    🏷️ Labels
                  </button>
                  <button type="button" className="ghost-chip" onClick={() => handleDeleteItem(item)}>
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>

          {editingItemId && editDraft ? (
            <article className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Edit Item</p>
                  <h3>{editDraft.itemName || "Update Item"}</h3>
                </div>
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
                saveMessage={saveMessage}
                saveError={saveError}
              />
            </article>
          ) : null}
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
                  <select value={outletFilter} onChange={(event) => setOutletFilter(event.target.value)}>
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
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="All">All</option>
                  {availableCategoryNames.map((categoryNameOption) => (
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
            <div className="entity-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Add category
              </button>
              {editingCategoryId ? (
                <button type="button" className="ghost-btn" onClick={cancelEditingCategory}>
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </div>

          <form className="simple-form" onSubmit={handleCreateCategory}>
            <label>
              Category name
              <input
                type="text"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Soups"
              />
            </label>
            <label>
              Available from
              <input
                type="time"
                value={categoryAvailableFrom}
                onChange={(event) => setCategoryAvailableFrom(event.target.value)}
              />
            </label>
            <label>
              Available to
              <input
                type="time"
                value={categoryAvailableTo}
                onChange={(event) => setCategoryAvailableTo(event.target.value)}
              />
            </label>
            <button type="submit" className="secondary-btn full-width">
              Save Category
            </button>
          </form>

          <div className="category-stack">
            {categoryGroups.map((category) => (
              <div key={category.id} className="mini-card">
                {editingCategoryId === category.id ? (
                  <>
                    <label>
                      Category name
                      <input
                        type="text"
                        value={editingCategoryName}
                        onChange={(event) => setEditingCategoryName(event.target.value)}
                      />
                    </label>
                    <label>
                      Available from
                      <input
                        type="time"
                        value={editingCategoryAvailableFrom}
                        onChange={(event) => setEditingCategoryAvailableFrom(event.target.value)}
                      />
                    </label>
                    <label>
                      Available to
                      <input
                        type="time"
                        value={editingCategoryAvailableTo}
                        onChange={(event) => setEditingCategoryAvailableTo(event.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <strong>{category.name}</strong>
                )}
                <div className="entity-actions">
                  {editingCategoryId === category.id ? (
                    <button type="button" className="primary-btn" onClick={() => handleSaveCategoryEdit(category)}>
                      Save Category
                    </button>
                  ) : (
                    <>
                      <button type="button" className="ghost-chip" onClick={() => startEditingCategory(category)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-chip" onClick={() => handleDeleteCategory(category)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
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
