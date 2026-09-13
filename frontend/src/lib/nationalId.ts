export const nationalIdDigits = (value = '') => String(value || '').replace(/\D/g, '').slice(0, 11);

export const formatDominicanId = (value = '') => {
  const digits = nationalIdDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
};

export const isValidDominicanId = (value = '') => {
  const digits = nationalIdDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    let product = Number(digits[index]) * (index % 2 === 0 ? 1 : 2);
    if (product > 9) product = Math.floor(product / 10) + (product % 10);
    sum += product;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[10]);
};

export const normalizeDominicanId = (value = '') => formatDominicanId(value);

export const sameDominicanId = (left = '', right = '') => nationalIdDigits(left) === nationalIdDigits(right);
