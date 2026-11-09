/** A fixed virtual forward lens, independent of the browser's window shape. */
export function forwardCameraCrop(width: number, height: number, horizontalFov: number, targetFov = 66) {
  if (![width, height, horizontalFov, targetFov].every(Number.isFinite) || width < 1 || height < 1 ||
    horizontalFov <= 0 || horizontalFov >= 179 || targetFov <= 0 || targetFov >= 179) throw new Error('Invalid camera frame');
  const focal = width / (2 * Math.tan(horizontalFov * Math.PI / 360));
  const desiredWidth = 2 * focal * Math.tan(targetFov * Math.PI / 360);
  const fit = Math.min(1, width / desiredWidth, height / (desiredWidth * 9 / 16));
  const sw = Math.max(1, Math.floor(desiredWidth * fit)), sh = Math.max(1, Math.floor(desiredWidth * fit * 9 / 16));
  return { sx: Math.floor((width - sw) / 2), sy: Math.floor((height - sh) / 2), sw, sh,
    horizontalFovDeg: Math.atan(sw / (2 * focal)) * 360 / Math.PI };
}
