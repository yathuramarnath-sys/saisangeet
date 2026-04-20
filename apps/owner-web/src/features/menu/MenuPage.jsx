import { useEffect, useRef, useState } from "react";
import { BulkImportPanel } from "./BulkImportPanel";

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
    categoryName: menuData.categories[0]?.name || "",
    station: menuData.stations[0]?.name || "",
    selectedOutlets: [] // empty = all outlets
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
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [routingDrafts, setRoutingDrafts] = useState({});
  const formRef = useRef(null);

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
  const missingTaxCount = menuData.items.filter((item) => Number(item.taxRate || 0) <= 0).length;
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

    return matchesSearch && matchesCategory && matchesStatus && matchesInventory && matchesFoodType;
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
          station: category.station || "Main kitchen",
          printerTarget: category.printerTarget || "Kitchen Printer 1",
          displayTarget: category.displayTarget || "Hot Kitchen Display"
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
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      setSaveError("");
      setSaveMessage("");
      await createCustomMenuItem({
        itemName: formData.get("itemName"),
        categoryName: formData.get("categoryName"),
        availableFrom: formData.get("availableFrom"),
        availableTo: formData.get("availableTo"),
        acDineIn: formData.get("acDineIn"),
        nonAcDineIn: formData.get("nonAcDineIn"),
        selfDineIn: formData.get("selfDineIn"),
        takeawayPrice: formData.get("takeawayPrice"),
        deliveryPrice: formData.get("deliveryPrice"),
        taxMode: formData.get("taxMode"),
        taxRate: formData.get("taxRate"),
        takeawayParcelChargeType: formData.get("takeawayParcelChargeType"),
        takeawayParcelChargeValue: formData.get("takeawayParcelChargeValue"),
        deliveryParcelChargeType: formData.get("deliveryParcelChargeType"),
        deliveryParcelChargeValue: formData.get("deliveryParcelChargeValue"),
        station: formData.get("station"),
        trackInventory: formData.get("trackInventory"),
        entryStyle: formData.get("entryStyle"),
        foodType: formData.get("foodType"),
        outletAvailability: itemDraft.selectedOutlets?.length
          ? itemDraft.selectedOutlets.map((name) => ({ outlet: name, enabled: true }))
          : availableOutlets.map((o) => ({ outlet: o.name, enabled: true }))
      });
      const result = await reloadMenu();
      form.reset();
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
        station: current[categoryId]?.station || "Main kitchen",
        printerTarget: current[categoryId]?.printerTarget || "Kitchen Printer 1",
        displayTarget: current[categoryId]?.displayTarget || "Hot Kitchen Display",
        ...current[categoryId],
        [field]: value
      }
    }));
  }

  function updateItemDraft(field, value) {
    setItemDraft((current) => ({
      ...current,
      [field]: value
    }));
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
      itemName: item.name,
      categoryName: item.categoryName || menuData.categories.find((category) => category.id === item.categoryId)?.name || "",
      station: item.station || "",
      availableFrom: item.availableFrom || "",
      availableTo: item.availableTo || "",
      foodType: item.foodType || "Veg",
      trackInventory: item.inventoryTracking.enabled ? "Enabled" : "Disabled",
      entryStyle: item.inventoryTracking.mode || "Item wise",
      acDineIn: priceValue(item.pricing, "AC", "dineIn"),
      nonAcDineIn: priceValue(item.pricing, "Non-AC", "dineIn"),
      selfDineIn: priceValue(item.pricing, "Self Service", "dineIn"),
      takeawayPrice: moneyValue(item.takeawayPrice || item.pricing?.[0]?.takeaway),
      deliveryPrice: moneyValue(item.deliveryPrice || item.pricing?.[0]?.delivery),
      taxMode: item.taxMode || "Exclusive",
      taxRate: String(item.taxRate || 0),
      takeawayParcelChargeType: item.parcelCharges?.takeaway?.type || "None",
      takeawayParcelChargeValue: String(item.parcelCharges?.takeaway?.value || 0),
      deliveryParcelChargeType: item.parcelCharges?.delivery?.type || "None",
      deliveryParcelChargeValue: String(item.parcelCharges?.delivery?.value || 0)
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
    const formData = new FormData(event.currentTarget);

    try {
      setSaveError("");
      setSaveMessage("");
      await updateCustomMenuItem(itemId, {
        itemName: formData.get("itemName"),
        categoryName: formData.get("categoryName"),
        availableFrom: formData.get("availableFrom"),
        availableTo: formData.get("availableTo"),
        acDineIn: formData.get("acDineIn"),
        nonAcDineIn: formData.get("nonAcDineIn"),
        selfDineIn: formData.get("selfDineIn"),
        takeawayPrice: formData.get("takeawayPrice"),
        deliveryPrice: formData.get("deliveryPrice"),
        taxMode: formData.get("taxMode"),
        taxRate: formData.get("taxRate"),
        takeawayParcelChargeType: formData.get("takeawayParcelChargeType"),
        takeawayParcelChargeValue: formData.get("takeawayParcelChargeValue"),
        deliveryParcelChargeType: formData.get("deliveryParcelChargeType"),
        deliveryParcelChargeValue: formData.get("deliveryParcelChargeValue"),
        station: formData.get("station"),
        trackInventory: formData.get("trackInventory"),
        entryStyle: formData.get("entryStyle"),
        foodType: formData.get("foodType")
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
        <article className="metric-card warning">
          <span className="metric-label">Missing GST</span>
          <strong>{missingTaxCount}</strong>
          <p>Items missing tax mode or tax rate</p>
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

          <form className="simple-form" onSubmit={(event) => handleUpdateItem(editingItemId, event)}>
                <label>
                  Item name
                  <input
                    type="text"
                    name="itemName"
                    value={editDraft.itemName}
                    onChange={(event) => setEditDraft((current) => ({ ...current, itemName: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Category
                  <select
                    name="categoryName"
                    value={editDraft.categoryName}
                    onChange={(event) => setEditDraft((current) => ({ ...current, categoryName: event.target.value }))}
                  >
                    {availableCategoryNames.map((categoryNameOption) => (
                      <option key={`edit-select-${categoryNameOption}`} value={categoryNameOption}>
                        {categoryNameOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kitchen station
                  <select
                    name="station"
                    value={editDraft.station}
                    onChange={(event) => setEditDraft((current) => ({ ...current, station: event.target.value }))}
                  >
                    {availableStationNames.map((stationNameOption) => (
                      <option key={`edit-station-${stationNameOption}`} value={stationNameOption}>
                        {stationNameOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Food type
                  <select
                    name="foodType"
                    value={editDraft.foodType}
                    onChange={(event) => setEditDraft((current) => ({ ...current, foodType: event.target.value }))}
                  >
                    <option>Veg</option>
                    <option>Non-Veg</option>
                  </select>
                </label>
                <label>
                  AC dine-in price
                  <input
                    type="number"
                    name="acDineIn"
                    min="0"
                    value={editDraft.acDineIn}
                    onChange={(event) => setEditDraft((current) => ({ ...current, acDineIn: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Non-AC dine-in price
                  <input
                    type="number"
                    name="nonAcDineIn"
                    min="0"
                    value={editDraft.nonAcDineIn}
                    onChange={(event) => setEditDraft((current) => ({ ...current, nonAcDineIn: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Self service dine-in price
                  <input
                    type="number"
                    name="selfDineIn"
                    min="0"
                    value={editDraft.selfDineIn}
                    onChange={(event) => setEditDraft((current) => ({ ...current, selfDineIn: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Takeaway price
                  <input
                    type="number"
                    name="takeawayPrice"
                    min="0"
                    value={editDraft.takeawayPrice}
                    onChange={(event) => setEditDraft((current) => ({ ...current, takeawayPrice: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Delivery price
                  <input
                    type="number"
                    name="deliveryPrice"
                    min="0"
                    value={editDraft.deliveryPrice}
                    onChange={(event) => setEditDraft((current) => ({ ...current, deliveryPrice: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Tax mode
                  <select
                    name="taxMode"
                    value={editDraft.taxMode}
                    onChange={(event) => setEditDraft((current) => ({ ...current, taxMode: event.target.value }))}
                  >
                    <option>Inclusive</option>
                    <option>Exclusive</option>
                  </select>
                </label>
                <label>
                  Tax rate
                  <input
                    type="number"
                    name="taxRate"
                    min="0"
                    step="0.01"
                    value={editDraft.taxRate}
                    onChange={(event) => setEditDraft((current) => ({ ...current, taxRate: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Available from
                  <input
                    type="time"
                    name="availableFrom"
                    value={editDraft.availableFrom}
                    onChange={(event) => setEditDraft((current) => ({ ...current, availableFrom: event.target.value }))}
                  />
                </label>
                <label>
                  Available to
                  <input
                    type="time"
                    name="availableTo"
                    value={editDraft.availableTo}
                    onChange={(event) => setEditDraft((current) => ({ ...current, availableTo: event.target.value }))}
                  />
                </label>
                <label>
                  Track inventory
                  <select
                    name="trackInventory"
                    value={editDraft.trackInventory}
                    onChange={(event) => setEditDraft((current) => ({ ...current, trackInventory: event.target.value }))}
                  >
                    <option>Enabled</option>
                    <option>Disabled</option>
                  </select>
                </label>
                <label>
                  Entry style
                  <select
                    name="entryStyle"
                    value={editDraft.entryStyle}
                    onChange={(event) => setEditDraft((current) => ({ ...current, entryStyle: event.target.value }))}
                  >
                    <option>Item wise</option>
                    <option>Category wise</option>
                    <option>Optional later</option>
                  </select>
                </label>
                <label>
                  Takeaway parcel charge
                  <select
                    name="takeawayParcelChargeType"
                    value={editDraft.takeawayParcelChargeType}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, takeawayParcelChargeType: event.target.value }))
                    }
                  >
                    <option>None</option>
                    <option>Fixed</option>
                    <option>Percentage</option>
                  </select>
                </label>
                <label>
                  Takeaway parcel charge value
                  <input
                    type="number"
                    name="takeawayParcelChargeValue"
                    min="0"
                    value={editDraft.takeawayParcelChargeValue}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, takeawayParcelChargeValue: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Delivery parcel charge
                  <select
                    name="deliveryParcelChargeType"
                    value={editDraft.deliveryParcelChargeType}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, deliveryParcelChargeType: event.target.value }))
                    }
                  >
                    <option>None</option>
                    <option>Fixed</option>
                    <option>Percentage</option>
                  </select>
                </label>
                <label>
                  Delivery parcel charge value
                  <input
                    type="number"
                    name="deliveryParcelChargeValue"
                    min="0"
                    value={editDraft.deliveryParcelChargeValue}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, deliveryParcelChargeValue: event.target.value }))
                    }
                  />
                </label>
                <div className="entity-actions">
                  <button type="submit" className="primary-btn">
                    Save Changes
                  </button>
                  <button type="button" className="secondary-btn" onClick={cancelEditingItem}>
                    Cancel
                  </button>
                </div>
              </form>
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

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Kitchen Routing</p>
              <h3>Category to Printer / Display</h3>
            </div>
          </div>

          <div className="mini-stack">
            {categoryGroups.map((category) => (
              <div key={`${category.id}-routing`} className="mini-card">
                <strong>{category.name}</strong>
                <label>
                  Kitchen station
                  <select
                    value={routingDrafts[category.id]?.station || category.station || "Main kitchen"}
                    onChange={(event) => updateRoutingDraft(category.id, "station", event.target.value)}
                  >
                    {menuData.stations.map((station) => (
                      <option key={station.id} value={station.name}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Printer target
                  <select
                    value={routingDrafts[category.id]?.printerTarget || category.printerTarget || "Kitchen Printer 1"}
                    onChange={(event) => updateRoutingDraft(category.id, "printerTarget", event.target.value)}
                  >
                    <option>Kitchen Printer 1</option>
                    <option>Bar Printer</option>
                    <option>No printer</option>
                  </select>
                </label>
                <label>
                  Display target
                  <select
                    value={routingDrafts[category.id]?.displayTarget || category.displayTarget || "Hot Kitchen Display"}
                    onChange={(event) => updateRoutingDraft(category.id, "displayTarget", event.target.value)}
                  >
                    <option>Hot Kitchen Display</option>
                    <option>Drinks Display</option>
                    <option>No display</option>
                  </select>
                </label>
                <button type="button" className="primary-btn" onClick={() => handleSaveRouting(category.id)}>
                  Save Routing
                </button>
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

          <form className="simple-form" onSubmit={handleSaveItem}>
            <label>
              Item name
              <input type="text" name="itemName" defaultValue="Gobi Manchurian" required />
            </label>
            <label>
              Category
              <input
                type="text"
                name="categoryName"
                list="menu-category-options"
                value={itemDraft.categoryName}
                onChange={(event) => updateItemDraft("categoryName", event.target.value)}
                placeholder="Choose or type a category"
                required
              />
            </label>
            <datalist id="menu-category-options">
              {availableCategoryNames.map((categoryNameOption) => (
                <option key={categoryNameOption} value={categoryNameOption} />
              ))}
            </datalist>
            <label>
              Food type
              <select name="foodType" defaultValue="Veg">
                <option>Veg</option>
                <option>Non-Veg</option>
              </select>
            </label>
            <label>
              AC dine-in price
              <input type="number" name="acDineIn" defaultValue="190" min="0" required />
            </label>
            <label>
              Takeaway price
              <input type="number" name="takeawayPrice" defaultValue="185" min="0" required />
            </label>
            <label>
              Delivery price
              <input type="number" name="deliveryPrice" defaultValue="205" min="0" required />
            </label>
            <label>
              Tax mode
              <select name="taxMode" defaultValue="Exclusive">
                <option>Inclusive</option>
                <option>Exclusive</option>
              </select>
            </label>
            <label>
              Tax rate
              <input type="number" name="taxRate" defaultValue="5" min="0" step="0.01" required />
            </label>
            <label>
              Available from
              <input type="time" name="availableFrom" defaultValue="10:00" />
            </label>
            <label>
              Available to
              <input type="time" name="availableTo" defaultValue="16:00" />
            </label>
            <label>
              Non-AC dine-in price
              <input type="number" name="nonAcDineIn" defaultValue="180" min="0" required />
            </label>
            <label>
              Self service dine-in price
              <input type="number" name="selfDineIn" defaultValue="170" min="0" required />
            </label>
            <label>
              Takeaway parcel charge
              <select name="takeawayParcelChargeType" defaultValue="None">
                <option>None</option>
                <option>Fixed</option>
                <option>Percentage</option>
              </select>
            </label>
            <label>
              Takeaway parcel charge value
              <input type="number" name="takeawayParcelChargeValue" defaultValue="0" min="0" />
            </label>
            <label>
              Delivery parcel charge
              <select name="deliveryParcelChargeType" defaultValue="None">
                <option>None</option>
                <option>Fixed</option>
                <option>Percentage</option>
              </select>
            </label>
            <label>
              Delivery parcel charge value
              <input type="number" name="deliveryParcelChargeValue" defaultValue="0" min="0" />
            </label>
            <label>
              Kitchen station
              <input
                type="text"
                name="station"
                list="menu-station-options"
                value={itemDraft.station}
                onChange={(event) => updateItemDraft("station", event.target.value)}
                placeholder="Choose or type a new station"
                required
              />
            </label>
            <datalist id="menu-station-options">
              {availableStationNames.map((stationNameOption) => (
                <option key={stationNameOption} value={stationNameOption} />
              ))}
            </datalist>
            <label>
              Track inventory
              <select name="trackInventory" defaultValue="Enabled">
                <option>Enabled</option>
                <option>Disabled</option>
              </select>
            </label>
            <label>
              Entry style
              <select name="entryStyle" defaultValue="Item wise">
                <option>Item wise</option>
                <option>Category wise</option>
                <option>Optional later</option>
              </select>
            </label>
            {/* Outlet availability */}
            {availableOutlets.length > 0 && (
              <div className="menu-outlet-avail">
                <span className="menu-outlet-avail-label">Available at outlets</span>
                <div className="menu-outlet-avail-options">
                  <label className={`menu-outlet-chip${!itemDraft.selectedOutlets?.length ? " selected" : ""}`}>
                    <input
                      type="radio"
                      name="outletScope"
                      checked={!itemDraft.selectedOutlets?.length}
                      onChange={() => updateItemDraft("selectedOutlets", [])}
                    />
                    <span>✓ All outlets</span>
                  </label>
                  {availableOutlets.map((outlet) => {
                    const checked = (itemDraft.selectedOutlets || []).includes(outlet.name);
                    return (
                      <label key={outlet.id || outlet.name} className={`menu-outlet-chip${checked ? " selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = itemDraft.selectedOutlets || [];
                            const next = e.target.checked
                              ? [...current, outlet.name]
                              : current.filter((n) => n !== outlet.name);
                            updateItemDraft("selectedOutlets", next);
                          }}
                        />
                        <span>{outlet.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="menu-outlet-avail-hint">
                  {!itemDraft.selectedOutlets?.length
                    ? "This item will be available at all outlets."
                    : `Available at: ${(itemDraft.selectedOutlets || []).join(", ") || "none selected"}`}
                </p>
              </div>
            )}
            {saveMessage ? <p>{saveMessage}</p> : null}
            {saveError ? <p>{saveError}</p> : null}
            <button type="submit" className="primary-btn full-width">
              Save Item
            </button>
          </form>
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

      {/* ── Bulk Import Panel ─────────────────────────────────────────────── */}
      {showImportPanel && (
        <BulkImportPanel
          onClose={() => setShowImportPanel(false)}
          onImportDone={() => reloadMenu()}
        />
      )}
    </>
  );
}
