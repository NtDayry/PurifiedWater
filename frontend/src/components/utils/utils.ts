export const formatCurrency = (amount: number) => {
  return `฿${Number(amount)?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export const isEmpty = (value: any): boolean => {
  return value === undefined || value === null || value === '';
};
