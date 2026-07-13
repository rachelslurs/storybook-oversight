// `export *` does not forward `default` (ESM). Keep both lines so a future
// `export default { viteFinal, ... }` preset object is not silently dropped.
export { default } from './dist/preset.js';
export * from './dist/preset.js';
