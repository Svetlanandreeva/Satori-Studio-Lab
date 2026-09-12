export const MANAGER_COMMISSION_RATE = 50;

export type DealEconomicsLike = {
  receivedAmount?: unknown;
  productionCost?: unknown;
  paymentCommission?: unknown;
  deliveryCost?: unknown;
  packagingCost?: unknown;
  contractorCost?: unknown;
  taxCost?: unknown;
  otherCost?: unknown;
  dealValue?: unknown;
};

function amount(value: unknown): number {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

export function directCostFromEconomics(row: DealEconomicsLike): number {
  return amount(row.productionCost) +
    amount(row.paymentCommission) +
    amount(row.deliveryCost) +
    amount(row.packagingCost) +
    amount(row.contractorCost) +
    amount(row.taxCost) +
    amount(row.otherCost);
}

export function calculateFinancialsFromDirectCost(
  receivedInput: unknown,
  directCostInput: unknown,
  dealValueInput: unknown = 0
) {
  const receivedAmount = amount(receivedInput);
  const directCost = amount(directCostInput);
  const dealValue = amount(dealValueInput);
  const profitBeforeManager = receivedAmount - directCost;
  const managerCommission = Math.max(
    0,
    Math.round((profitBeforeManager * MANAGER_COMMISSION_RATE) / 100)
  );
  const totalCost = directCost + managerCommission;
  const profit = receivedAmount - totalCost;
  const margin = receivedAmount > 0 ? (profit / receivedAmount) * 100 : 0;
  const unpaid = Math.max(0, dealValue - receivedAmount);

  return {
    receivedAmount,
    directCost,
    profitBeforeManager,
    managerCommission,
    managerCommissionRate: MANAGER_COMMISSION_RATE,
    totalCost,
    profit,
    margin,
    unpaid,
  };
}

export function calculateDealFinancials(row: DealEconomicsLike) {
  return calculateFinancialsFromDirectCost(
    row.receivedAmount,
    directCostFromEconomics(row),
    row.dealValue
  );
}
