/**
 * Replaced: custom iOS/Android-looking permission dialogs are not used.
 * Browser file access must go through the OS file picker (`<input type="file">`).
 */
export function DeviceFileSync() {
  return null;
}
