import { describe, expect, it, vi } from 'vitest';
import { install_app_kit } from '../src/utils/app_kit.js';

const CONFIG = {
  shape_message: 'shape',
  save_message: 'save',
  sizes: ['compact', 'regular', 'large'],
  orientations: ['landscape', 'square', 'portrait'],
  state: null,
  state_max_length: 100,
};

// A stand-in app page with the kit installed: its root element, its parent and the message
// listener the kit adds.
function make_app_page(config = CONFIG) {
  const root = document.createElement('html');
  root.dataset.size = 'regular';
  const parent = { postMessage: vi.fn() };
  let handle_message = null;
  const app_window = { document: { documentElement: root }, parent, addEventListener: (type, listener) => (handle_message = listener) };
  install_app_kit(app_window, config);
  return { kit: app_window.kit, root, parent, send: (data, source = parent) => handle_message({ data, source }) };
}

describe('kit.calc', () => {
  const { kit } = make_app_page();

  it('follows the order of operations, brackets and powers', () => {
    expect(kit.calc('2 + 3 * 4')).toBe(14);
    expect(kit.calc('(2 + 3) * 4')).toBe(20);
    expect(kit.calc('2^3^2')).toBe(512);
    expect(kit.calc('-2^2')).toBe(-4);
    expect(kit.calc('2^-1')).toBe(0.5);
    expect(kit.calc('2 ** 10')).toBe(1024);
    expect(kit.calc('10 / 4 - 1')).toBe(1.5);
  });

  it('reads calculator symbols, implied multiplication, factorials and percentages', () => {
    expect(kit.calc('6 × 7 ÷ 2 − 1')).toBe(20);
    expect(kit.calc('√16 + √(9)')).toBe(7);
    expect(kit.calc('2pi')).toBeCloseTo(6.283185307, 8);
    expect(kit.calc('3(4 + 1)')).toBe(15);
    expect(kit.calc('(1 + 1)(2 + 2)')).toBe(8);
    expect(kit.calc('5!')).toBe(120);
    expect(kit.calc('50% * 80')).toBe(40);
  });

  it('has functions, constants and the last answer, and removes floating point noise', () => {
    expect(kit.calc('0.1 + 0.2')).toBe(0.3);
    expect(kit.calc('sin(30)', { angle: 'deg' })).toBe(0.5);
    expect(kit.calc('sin(180)', { angle: 'deg' })).toBe(0);
    expect(kit.calc('asin(1)', { angle: 'deg' })).toBe(90);
    expect(kit.calc('cos(pi)')).toBe(-1);
    expect(kit.calc('log(1000) + ln(e) + log2(8)')).toBe(7);
    expect(kit.calc('max(3, 9, 4) + min(2, 1)')).toBe(10);
    expect(kit.calc('mod(-7, 3)')).toBe(2);
    expect(kit.calc('PI')).toBeCloseTo(Math.PI, 12);
    kit.calc('6 * 7');
    expect(kit.calc('ans / 2')).toBe(21);
  });

  it('explains what is wrong in words a student can follow', () => {
    expect(() => kit.calc('')).toThrow('Type something to work out');
    expect(() => kit.calc('(2 + 3')).toThrow('A bracket is missing');
    expect(() => kit.calc('2 + 3)')).toThrow('There is an extra bracket');
    expect(() => kit.calc('2 +')).toThrow('Something is missing at the end');
    expect(() => kit.calc('1 / 0')).toThrow('divides by zero');
    expect(() => kit.calc('sqrt(-1)')).toThrow("doesn't have an answer");
    expect(() => kit.calc('foo(2)')).toThrow('I don\'t know "foo"');
    expect(() => kit.calc('2 $ 3')).toThrow('"$" isn\'t something I can work out');
    expect(() => kit.calc('2.5!')).toThrow('whole number');
    expect(() => kit.calc('* 3')).toThrow('"*" is in the wrong place');
  });
});

describe('kit.format, units and convert', () => {
  const { kit } = make_app_page();

  it('shows numbers tidily', () => {
    expect(kit.format(1234.5678)).toBe('1,234.5678');
    expect(kit.format(2 / 3)).toBe('0.6666666667');
    expect(kit.format(2 / 3, { digits: 3 })).toBe('0.667');
    expect(kit.format(-0)).toBe('0');
    expect(kit.format(1.5e20)).toBe('1.5e20');
    expect(kit.format(1e20)).toBe('1e20');
    expect(kit.format(2.5e-8)).toBe('2.5e-8');
    expect(kit.format(Number.NaN)).toBe('–');
  });

  it('lists units by category and converts within one', () => {
    expect(Object.keys(kit.units)).toEqual(['temperature', 'length', 'mass', 'time', 'volume', 'area', 'speed', 'data', 'energy', 'pressure', 'force', 'power', 'angle']);
    expect(kit.units.length.find((unit) => unit.id === 'km')).toEqual({ id: 'km', label: 'Kilometres' });
    expect(kit.convert(1, 'mi', 'km')).toBe(1.609344);
    expect(kit.convert(100, 'C', 'F')).toBe(212);
    expect(kit.convert(0, '°C', 'kelvin')).toBe(273.15);
    expect(kit.convert(1, 'ml', 'L')).toBe(0.001);
    expect(kit.convert(1, 'atm', 'kPa')).toBe(101.325);
    expect(kit.convert(180, 'deg', 'rad')).toBeCloseTo(Math.PI, 12);
    expect(kit.convert('2', 'GiB', 'MiB')).toBe(2048);
  });

  it('turns down unknown or mismatched units', () => {
    expect(() => kit.convert(1, 'km', 'kg')).toThrow("Can't convert length to mass");
    expect(() => kit.convert(1, 'parsec', 'km')).toThrow('I don\'t know the unit "parsec"');
  });
});

describe('kit.save, load and size', () => {
  it('saves data through the parent, and loads it back as a copy', () => {
    const { kit, parent } = make_app_page({ ...CONFIG, state: { score: 2 } });
    expect(kit.load()).toEqual({ score: 2 });
    kit.load().score = 99;
    expect(kit.load()).toEqual({ score: 2 });
    expect(kit.save({ score: 3 })).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'save', state: { score: 3 } }, '*');
    expect(kit.load()).toEqual({ score: 3 });
    expect(kit.save({ text: 'x'.repeat(200) })).toBe(false);
    expect(kit.load()).toEqual({ score: 3 });
    expect(make_app_page().kit.load()).toBeNull();
  });

  it("follows the widget's shape from its parent only, telling listeners", () => {
    const { kit, root, send } = make_app_page();
    const listener = vi.fn();
    kit.on_size(listener);
    expect(kit.size()).toEqual({ size: 'regular', orientation: null });

    send({ type: 'shape', size: 'compact', orientation: 'portrait' });
    expect(root.dataset).toMatchObject({ size: 'compact', orientation: 'portrait' });
    expect(listener).toHaveBeenLastCalledWith({ size: 'compact', orientation: 'portrait' });
    send({ type: 'shape', size: 'huge', orientation: null });
    expect(kit.size()).toEqual({ size: 'compact', orientation: null });
    send({ type: 'shape', size: 'large' }, {});
    send({ type: 'other', size: 'large' });
    expect(root.dataset.size).toBe('compact');
  });
});
