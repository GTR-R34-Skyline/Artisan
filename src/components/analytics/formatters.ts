export const formatRupees = (value: number) =>
  `₹${Math.round(value).toLocaleString('en-IN')}`;

export const formatCount = (value: number) =>
  Math.round(value).toLocaleString('en-IN');

export const formatRating = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
