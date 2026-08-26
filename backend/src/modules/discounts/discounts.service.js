const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { getState, hydrateState } = require("../operations/operations.memory-store");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function syncDiscountDefaultsToOperations(defaults) {
  const nextState = getState();
  nextState.permissionPolicies = {
    ...(nextState.permissionPolicies || {}),
    "cashier-discount-limit-percent": Number(defaults.cashierLimitPercent || 0)
  };
  hydrateState(nextState);
}

async function getDiscountSettings() {
  const data = getOwnerSetupData();
  return clone(data.discounts || { rules: [], approvalPolicy: [], defaults: {} });
}

async function createDiscountRule(payload) {
  const rule = {
    id: `discount-${Date.now()}`,
    name: payload.name,
    discountType: payload.discountType || "percentage",
    discountScope: payload.discountScope || "order",
    value: Number(payload.value || 0),
    outletScope: payload.outletScope || "All Outlets",
    appliesToRole: payload.appliesToRole || "Cashier",
    requiresApproval: Boolean(payload.requiresApproval),
    timeWindow: payload.timeWindow || "Always on",
    isActive: payload.isActive ?? true,
    notes: payload.notes || ""
  };

  updateOwnerSetupData((current) => ({
    ...current,
    discounts: {
      ...(current.discounts || {}),
      rules: [...(current.discounts?.rules || []), rule]
    }
  }));

  return rule;
}

async function updateDiscountRule(ruleId, payload) {
  let updatedRule = null;

  updateOwnerSetupData((current) => ({
    ...current,
    discounts: {
      ...(current.discounts || {}),
      rules: (current.discounts?.rules || []).map((rule) => {
        if (rule.id !== ruleId) {
          return rule;
        }

        updatedRule = {
          ...rule,
          name: payload.name ?? rule.name,
          discountType: payload.discountType ?? rule.discountType,
          discountScope: payload.discountScope ?? rule.discountScope,
          value: payload.value !== undefined ? Number(payload.value || 0) : rule.value,
          outletScope: payload.outletScope ?? rule.outletScope,
          appliesToRole: payload.appliesToRole ?? rule.appliesToRole,
          requiresApproval: payload.requiresApproval ?? rule.requiresApproval,
          timeWindow: payload.timeWindow ?? rule.timeWindow,
          isActive: payload.isActive ?? rule.isActive,
          notes: payload.notes ?? rule.notes
        };

        return updatedRule;
      })
    }
  }));

  return updatedRule;
}

async function deleteDiscountRule(ruleId) {
  let deletedRule = null;

  updateOwnerSetupData((current) => {
    deletedRule = (current.discounts?.rules || []).find((rule) => rule.id === ruleId) || null;

    return {
      ...current,
      discounts: {
        ...(current.discounts || {}),
        rules: (current.discounts?.rules || []).filter((rule) => rule.id !== ruleId)
      }
    };
  });

  return deletedRule;
}

async function updateDiscountApprovalPolicy(policyId, payload) {
  let updatedPolicy = null;

  updateOwnerSetupData((current) => {
    const nextDiscounts = {
      ...(current.discounts || {}),
      approvalPolicy: (current.discounts?.approvalPolicy || []).map((row) => {
        if (row.id !== policyId) {
          return row;
        }

        updatedPolicy = {
          ...row,
          manualDiscountLimit:
            payload.manualDiscountLimit !== undefined ? Number(payload.manualDiscountLimit || 0) : row.manualDiscountLimit,
          orderVoid: payload.orderVoid ?? row.orderVoid,
          billDelete: payload.billDelete ?? row.billDelete,
          approvalRoute: payload.approvalRoute ?? row.approvalRoute,
          status: payload.status ?? row.status
        };

        return updatedPolicy;
      })
    };

    if (updatedPolicy?.role === "Cashier") {
      nextDiscounts.defaults = {
        ...(current.discounts?.defaults || {}),
        cashierLimitPercent: updatedPolicy.manualDiscountLimit
      };
    }

    if (updatedPolicy?.role === "Manager") {
      nextDiscounts.defaults = {
        ...(nextDiscounts.defaults || current.discounts?.defaults || {}),
        managerLimitPercent: updatedPolicy.manualDiscountLimit
      };
    }

    return {
      ...current,
      discounts: nextDiscounts
    };
  });

  if (updatedPolicy?.role === "Cashier" || updatedPolicy?.role === "Manager") {
    const { defaults } = await getDiscountSettings();
    syncDiscountDefaultsToOperations(defaults);
  }

  return updatedPolicy;
}

async function updateDiscountDefaults(payload) {
  let updatedDefaults = null;

  updateOwnerSetupData((current) => {
    updatedDefaults = {
      ...(current.discounts?.defaults || {}),
      ...(payload.cashierLimitPercent !== undefined
        ? { cashierLimitPercent: Number(payload.cashierLimitPercent || 0) }
        : {}),
      ...(payload.managerLimitPercent !== undefined
        ? { managerLimitPercent: Number(payload.managerLimitPercent || 0) }
        : {}),
      ...(payload.reasonRequired !== undefined ? { reasonRequired: Boolean(payload.reasonRequired) } : {}),
      ...(payload.auditLogEnabled !== undefined ? { auditLogEnabled: Boolean(payload.auditLogEnabled) } : {}),
      ...(payload.allowRuleStacking !== undefined ? { allowRuleStacking: Boolean(payload.allowRuleStacking) } : {})
    };

    return {
      ...current,
      discounts: {
        ...(current.discounts || {}),
        defaults: updatedDefaults,
        approvalPolicy: (current.discounts?.approvalPolicy || []).map((row) => {
          if (row.role === "Cashier") {
            return { ...row, manualDiscountLimit: updatedDefaults.cashierLimitPercent };
          }

          if (row.role === "Manager") {
            return { ...row, manualDiscountLimit: updatedDefaults.managerLimitPercent };
          }

          return row;
        })
      }
    };
  });

  syncDiscountDefaultsToOperations(updatedDefaults);
  return updatedDefaults;
}

module.exports = {
  getDiscountSettings,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
  updateDiscountApprovalPolicy,
  updateDiscountDefaults
};
