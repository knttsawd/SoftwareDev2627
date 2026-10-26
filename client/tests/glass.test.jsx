import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlassRefraction from '../src/components/widgets/GlassRefraction.jsx';
import { GLASS_MAX_BEND_PX } from '../src/config/constants.js';
import { build_displacement_pixels, can_refract_backdrop, measure_rounded_edge, render_displacement_map } from '../src/utils/glass.js';

describe('glass edges', () => {
  it('only bends the page in Chromium browsers', () => {
    expect(can_refract_backdrop({ userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }] } })).toBe(true);
    expect(can_refract_backdrop({ userAgentData: { brands: [{ brand: 'Not A Brand' }] } })).toBe(false);
    expect(can_refract_backdrop({})).toBe(false);
    expect(can_refract_backdrop(undefined)).toBe(false);
  });

  it('measures how far a point is inside a rounded rectangle, and which edge is nearest', () => {
    expect(measure_rounded_edge(50, 2, 100, 60, 10)).toEqual({ distance: 2, normal_x: 0, normal_y: -1 });
    expect(measure_rounded_edge(97, 30, 100, 60, 10)).toEqual({ distance: 3, normal_x: 1, normal_y: 0 });
    const corner = measure_rounded_edge(97, 57, 100, 60, 10);
    expect(corner.distance).toBeCloseTo(10 - Math.hypot(7, 7), 10);
    expect(corner.normal_x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(corner.normal_y).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('bends most at the edge, inwards, and leaves the middle clear', () => {
    const width = 40;
    const pixels = build_displacement_pixels(width, 40, 8, 10);
    const pixel_at = (x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
    expect(pixel_at(20, 20)).toEqual([128, 128, 128, 255]);
    // At the left edge the page is taken from further right; at the top, from further down.
    expect(pixel_at(0, 20)[0]).toBeGreaterThan(220);
    expect(pixel_at(20, 0)[1]).toBeGreaterThan(220);
    expect(pixel_at(39, 20)[0]).toBeLessThan(40);
    expect(pixel_at(5, 20)[0]).toBeLessThan(pixel_at(1, 20)[0]);
  });
});

describe('GlassRefraction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws the map over a neutral layer into an SVG filter that bends as much as the widget says', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,map');
    vi.stubGlobal('ImageData', class {});
    const { container } = render(<GlassRefraction filter_id="test-glass" width={301} height={198} radius={30} bend={50} />);
    const filter = container.querySelector('filter#test-glass');
    expect(filter).toHaveAttribute('width', '301');
    expect(container.querySelector('feImage')).toHaveAttribute('href', 'data:image/png;base64,map');
    // Outside the drawn map is the neutral grey, so nothing there moves.
    expect(container.querySelector('feFlood')).toHaveAttribute('flood-color', 'rgb(128, 128, 128)');
    expect(container.querySelector('feComposite')).toHaveAttribute('operator', 'over');
    expect([...container.querySelectorAll('feDisplacementMap')].map((map) => Number(map.getAttribute('scale')))).toEqual([GLASS_MAX_BEND_PX]);
    vi.unstubAllGlobals();
  });

  it('draws nothing without a size or a canvas', () => {
    expect(render(<GlassRefraction filter_id="a" width={0} height={0} radius={22} bend={50} />).container).toBeEmptyDOMElement();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(render_displacement_map(100, 100, { radius: 22, bevel: 22, resolution: 0.5 })).toBeNull();
    expect(render(<GlassRefraction filter_id="b" width={100} height={100} radius={22} bend={50} />).container).toBeEmptyDOMElement();
  });
});
