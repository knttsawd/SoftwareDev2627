// Glass widgets: the maths behind their lens-like edges. A displacement map says, for every
// point of a window, where to take the page behind it from. Near the rounded edge each point
// takes it from further in, so what's behind bends at the edge like light through thick
// glass; the middle stays clear. Only Chromium can apply an SVG filter to what's behind an
// element (backdrop-filter: url()), so other browsers keep the plain frosted glass.

const NO_MOVE = 128;
const MOST_MOVE = 127;

// True where the browser can bend what's behind an element with an SVG filter.
export function can_refract_backdrop(navigator_object = globalThis.navigator) {
  return Boolean(navigator_object?.userAgentData?.brands?.some((brand) => brand.brand === 'Chromium'));
}

// How far inside a rounded rectangle (width by height, corner radius) the point x, y is,
// and the outward direction of its nearest edge: { distance, normal_x, normal_y }.
export function measure_rounded_edge(x, y, width, height, radius) {
  const from_center_x = x - width / 2;
  const from_center_y = y - height / 2;
  const past_corner_x = Math.abs(from_center_x) - (width / 2 - radius);
  const past_corner_y = Math.abs(from_center_y) - (height / 2 - radius);
  const side_x = Math.sign(from_center_x) || 1;
  const side_y = Math.sign(from_center_y) || 1;
  if (past_corner_x > 0 && past_corner_y > 0) {
    const from_corner = Math.hypot(past_corner_x, past_corner_y);
    return { distance: radius - from_corner, normal_x: (past_corner_x / from_corner) * side_x, normal_y: (past_corner_y / from_corner) * side_y };
  }
  if (past_corner_x > past_corner_y) return { distance: radius - past_corner_x, normal_x: side_x, normal_y: 0 };
  return { distance: radius - past_corner_y, normal_x: 0, normal_y: side_y };
}

// The displacement map's pixels (RGBA, width by height): red and green say how far left or
// right and up or down each point takes the page from (128 is no move). The bend is
// strongest at the edge and fades to nothing bevel pixels in.
export function build_displacement_pixels(width, height, radius, bevel) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { distance, normal_x, normal_y } = measure_rounded_edge(x + 0.5, y + 0.5, width, height, radius);
      const strength = distance >= bevel ? 0 : (1 - Math.max(distance, 0) / bevel) ** 2;
      const index = (y * width + x) * 4;
      pixels[index] = NO_MOVE - normal_x * strength * MOST_MOVE;
      pixels[index + 1] = NO_MOVE - normal_y * strength * MOST_MOVE;
      pixels[index + 2] = NO_MOVE;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

// The displacement map as an image (a data: URL) for an SVG filter, drawn at resolution
// times the size given, or null where there's no canvas to draw it on.
export function render_displacement_map(width, height, { radius, bevel, resolution }) {
  const map_width = Math.max(1, Math.round(width * resolution));
  const map_height = Math.max(1, Math.round(height * resolution));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext?.('2d');
  if (!context || typeof ImageData === 'undefined') return null;
  canvas.width = map_width;
  canvas.height = map_height;
  const pixels = build_displacement_pixels(map_width, map_height, radius * resolution, bevel * resolution);
  context.putImageData(new ImageData(pixels, map_width, map_height), 0, 0);
  return canvas.toDataURL();
}
