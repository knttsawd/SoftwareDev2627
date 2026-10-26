import { useMemo } from 'react';
import { GLASS_BEVEL_PX, GLASS_MAP_RESOLUTION, GLASS_MAX_BEND_PX, GLASS_SIZE_STEP_PX } from '../../config/constants.js';
import { render_displacement_map } from '../../utils/glass.js';

// "No move" in a displacement map: mid grey.
const NEUTRAL_MAP_COLOR = 'rgb(128, 128, 128)';

// The SVG filter a glass window uses on what's behind it (backdrop-filter: url(#filter_id)):
// the page is bent at the edges by the displacement map (utils/glass.js) for a window
// width by height with corner radius, by up to GLASS_MAX_BEND_PX at bend 100.
// The map sits on a neutral grey layer: wherever the map doesn't reach (its blurred border,
// or a pixel or two while the window resizes), nothing moves. Without it, those pixels read
// as "take the page from far up and left", pulling dark or coloured bands in from outside
// the window. The map is redrawn only when the size changes by GLASS_SIZE_STEP_PX, so
// resizing stays smooth.
function GlassRefraction({ filter_id, width, height, radius, bend }) {
  const map_width = Math.round(width / GLASS_SIZE_STEP_PX) * GLASS_SIZE_STEP_PX;
  const map_height = Math.round(height / GLASS_SIZE_STEP_PX) * GLASS_SIZE_STEP_PX;
  const map_url = useMemo(
    () =>
      map_width > 0 && map_height > 0
        ? render_displacement_map(map_width, map_height, { radius, bevel: GLASS_BEVEL_PX, resolution: GLASS_MAP_RESOLUTION })
        : null,
    [map_width, map_height, radius],
  );
  if (!map_url) return null;

  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <filter id={filter_id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} colorInterpolationFilters="sRGB">
        <feFlood floodColor={NEUTRAL_MAP_COLOR} result="neutral" />
        <feImage href={map_url} x="0" y="0" width={width} height={height} preserveAspectRatio="none" result="drawn-map" />
        <feComposite in="drawn-map" in2="neutral" operator="over" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={(GLASS_MAX_BEND_PX * 2 * bend) / 100} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export default GlassRefraction;
