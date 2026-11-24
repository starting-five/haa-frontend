/** A byte count as a short human size, in powers of 1000: `formatBytes(2400000, 1)` is "2.4 MB". */
export const formatBytes = (bytes: number, decimals = 2) => {
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["bytes", "KB", "MB", "GB", "TB"];

  if (!bytes) return "0 bytes";
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};
