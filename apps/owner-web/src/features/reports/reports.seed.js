export const OUTLETS = ["All Outlets"];
export const MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// No seed data — reports are generated from live POS sales
export const dayEndSeed = {
  summary: { totalSales: 0, totalOrders: 0, avgOrderValue: 0, netAfterDiscount: 0, totalTax: 0, totalDiscount: 0, totalCancelled: 0, cancelledValue: 0 },
  paymentModes: [],
  orderTypes:   [],
  sessions:     [],
  categories:   [],
  items:        [],
  tax:          { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, totalTax: 0 },
  discounts:    [],
  cancellations:[]
};

export const itemSalesSeed     = [];
export const gstSeed           = { month: "", summary: { taxableAmount: 0, cgst: 0, sgst: 0, totalGst: 0, totalBills: 0 }, daily: [], outletBreakdown: [] };
export const paymentSeed       = { summary: { totalCollected: 0, cashAmount: 0, digitalAmount: 0, variance: 0 }, modes: [], hourly: [], outletReconciliation: [] };
export const discountVoidSeed  = { summary: { totalDiscountAmt: 0, totalDiscountBills: 0, totalVoids: 0, totalVoidAmt: 0, manualOverrides: 0 }, discountLog: [], voidLog: [] };
export const staffSalesSeed    = [];
export const categorySalesSeed = { categories: [], items: {} };
