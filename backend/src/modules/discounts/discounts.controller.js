const {
  getDiscountSettings,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
  updateDiscountApprovalPolicy,
  updateDiscountDefaults
} = require("./discounts.service");

async function listDiscountSettingsHandler(_req, res) {
  const result = await getDiscountSettings();
  res.json(result);
}

async function createDiscountRuleHandler(req, res) {
  const result = await createDiscountRule(req.body);
  res.status(201).json(result);
}

async function updateDiscountRuleHandler(req, res) {
  const result = await updateDiscountRule(req.params.ruleId, req.body);
  res.json(result);
}

async function deleteDiscountRuleHandler(req, res) {
  const result = await deleteDiscountRule(req.params.ruleId);
  res.json(result || { success: true });
}

async function updateDiscountApprovalPolicyHandler(req, res) {
  const result = await updateDiscountApprovalPolicy(req.params.policyId, req.body);
  res.json(result);
}

async function updateDiscountDefaultsHandler(req, res) {
  const result = await updateDiscountDefaults(req.body);
  res.json(result);
}

module.exports = {
  listDiscountSettingsHandler,
  createDiscountRuleHandler,
  updateDiscountRuleHandler,
  deleteDiscountRuleHandler,
  updateDiscountApprovalPolicyHandler,
  updateDiscountDefaultsHandler
};
