import 'fake-indexeddb/auto'

// jsdom has no object-URL implementation, and every image path in the app
// goes through one. A counter is enough for the logic under test.
if (typeof URL.createObjectURL !== 'function') {
  let next = 0
  URL.createObjectURL = () => `blob:test/${next++}`
  URL.revokeObjectURL = () => {}
}
