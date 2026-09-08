/** Fail early while printing variable names only—never their values. */

const option = (name) => {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '') : '';
};

const names = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);
const required = names(option('required'));
const optional = names(option('optional'));
const missing = required.filter((name) => !String(process.env[name] || '').trim());
const unavailableOptional = optional.filter((name) => !String(process.env[name] || '').trim());

if (unavailableOptional.length) console.log(`[config] optional unavailable: ${unavailableOptional.join(', ')}`);
if (missing.length) {
  console.error(`[config] missing required: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`[config] required configuration present: ${required.join(', ') || 'none'}`);
