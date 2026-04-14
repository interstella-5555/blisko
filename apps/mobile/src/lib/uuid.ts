// Re-exports the standard `uuid` package's v4. Relies on `crypto.getRandomValues`
// being polyfilled globally — see `react-native-get-random-values` import at the
// top of app/_layout.tsx.
export { v4 as uuidv4 } from "uuid";
