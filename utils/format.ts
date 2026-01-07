export const formatINR = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return "₹0.00";
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};
