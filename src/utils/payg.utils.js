/**
 * Calculates PAYG (Pay As You Go) charges based on remaining quota, weight, PAYG rate, and minimum billing unit.
 *
 * @param {number} remainingQuotaKg - Student's remaining quota in KG
 * @param {number} intakeWeightKg - Weight of the drop-off items in KG
 * @param {number} paygRatePerKg - Cost per KG for over quota
 * @param {number} minBillingUnitKg - Minimum billing unit step in KG (default 5 KG)
 * @param {number} discountPercent - Discount percentage applied by staff (0 to max allowed %)
 * @returns {object} { overQuotaKg, billableUnitsKg, paygAmount, discountAmount, finalAmount }
 */
const calculatePaygBilling = ({
  remainingQuotaKg = 0,
  intakeWeightKg = 0,
  paygRatePerKg = 50,
  minBillingUnitKg = 5.0,
  discountPercent = 0.0,
}) => {
  let overQuotaKg = 0;
  if (intakeWeightKg > remainingQuotaKg) {
    overQuotaKg = intakeWeightKg - remainingQuotaKg;
  }

  let billableUnitsKg = 0;
  if (overQuotaKg > 0) {
    const unit = minBillingUnitKg > 0 ? minBillingUnitKg : 1.0;
    billableUnitsKg = Math.ceil(overQuotaKg / unit) * unit;
  }

  const rawPaygAmount = billableUnitsKg * paygRatePerKg;
  const safeDiscountPercent = Math.min(Math.max(discountPercent, 0), 100);
  const discountAmount = (rawPaygAmount * safeDiscountPercent) / 100;
  const finalAmount = Math.max(rawPaygAmount - discountAmount, 0);

  return {
    overQuotaKg: parseFloat(overQuotaKg.toFixed(2)),
    billableUnitsKg: parseFloat(billableUnitsKg.toFixed(2)),
    paygAmount: parseFloat(rawPaygAmount.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalAmount: parseFloat(finalAmount.toFixed(2)),
  };
};

module.exports = {
  calculatePaygBilling,
};
