function deriveEmailPattern(firstName, lastName, email) {
  const [local] = email.toLowerCase().split('@');
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const fi = f[0];
  const li = l[0];

  if (!f || !l) return 'unknown';

  if (local === `${f}.${l}`) return '{first}.{last}';
  if (local === `${fi}.${l}`) return '{f}.{last}';
  if (local === `${f}.${li}`) return '{first}.{l}';
  if (local === `${f}${l}`) return '{first}{last}';
  if (local === `${fi}${l}`) return '{f}{last}';
  if (local === `${f}${li}`) return '{first}{l}';
  if (local === `${l}.${f}`) return '{last}.{first}';
  if (local === `${l}${fi}`) return '{last}{f}';
  if (local === f) return '{first}';
  
  // Smart fallbacks for nicknames (e.g. Matt -> matthew.delvecchio)
  if (local.endsWith(`.${l}`) && local.startsWith(fi)) return '{first}.{last}';
  if (local.endsWith(l) && local.startsWith(fi) && !local.includes('.')) return '{first}{last}';
  
  return 'unknown';
}
console.log(deriveEmailPattern("Matt", "DelVecchio", "matthew.delvecchio@landsend.com"));
