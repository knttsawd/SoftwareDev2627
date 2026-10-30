// The kit an app widget's page gets as window.kit: what the AI's apps need that the
// sandbox blocks or that's easy to get wrong. install_app_kit is copied into the app's page
// as source (build_app_document), so it must not use anything from outside itself; config
// carries everything it needs.
//
//   kit.calc(expression, { angle })  works out a maths expression safely (the page's policy
//        blocks eval() and new Function()). Numbers, + - * / ^ ( ), × ÷ − and √, implicit
//        multiplication (2pi, 3(4+1)), postfix ! (factorial) and % (per cent), the
//        functions in CALC_FUNCTIONS, the constants pi, π, e and tau, and "ans" (the last
//        answer). angle is "rad" (the default) or "deg" for the trigonometry. Throws an
//        Error with a message a student can read when the expression doesn't work.
//   kit.format(number, { digits })   a number for showing: up to digits (10) significant
//        digits, grouped with commas, very large or small ones as 1.5e20.
//   kit.units                        { category: [{ id, label }] } for length, mass,
//        time, temperature, volume, area, speed, data, energy, pressure, force, power, angle.
//   kit.convert(value, from, to)     converts between two unit ids of the same category.
//   kit.save(data) / kit.load()      keeps a little data (JSON, up to state_max_length
//        characters) with the widget, so the app remembers it next time. save returns false
//        when the data is too big.
//   kit.size() / kit.on_size(listener)  the widget's shape, { size, orientation }, now and
//        whenever it changes. <html data-size> and data-orientation follow it too.
export function install_app_kit(app_window, config) {
  const root = app_window.document.documentElement;
  const size_listeners = [];
  let saved_state = config.state ?? null;
  let last_answer = 0;

  // Takes the widget's shape from the frame's own parent, and only known values.
  app_window.addEventListener('message', (message_event) => {
    const data = message_event.data;
    if (message_event.source !== app_window.parent || !data || data.type !== config.shape_message) return;
    if (config.sizes.includes(data.size)) root.dataset.size = data.size;
    if (config.orientations.includes(data.orientation)) root.dataset.orientation = data.orientation;
    else delete root.dataset.orientation;
    size_listeners.forEach((listener) => listener(read_size()));
  });

  function read_size() {
    return { size: root.dataset.size, orientation: root.dataset.orientation ?? null };
  }

  // Maths: a small parser, so nothing the student types is ever run as code.
  const DEGREES = Math.PI / 180;
  const CONSTANTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI };
  const TRIG = ['sin', 'cos', 'tan'];
  const INVERSE_TRIG = ['asin', 'acos', 'atan'];
  const CALC_FUNCTIONS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, '√': Math.sqrt, cbrt: Math.cbrt,
    abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, floor: Math.floor,
    ceil: Math.ceil, round: Math.round, sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow,
    mod: (left, right) => ((left % right) + right) % right,
  };
  const SYMBOLS = { '×': '*', '÷': '/', '−': '-', '–': '-' };
  const TOKEN_PATTERN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-zA-Z]+\d*|π|√)|(\*\*|[-+*/^%!(),×÷−–]))/y;

  function read_tokens(expression) {
    const tokens = [];
    TOKEN_PATTERN.lastIndex = 0;
    const text = String(expression).trim();
    while (TOKEN_PATTERN.lastIndex < text.length) {
      const start = TOKEN_PATTERN.lastIndex;
      const match = TOKEN_PATTERN.exec(text);
      if (!match) throw new Error(`"${text.slice(start).trim().charAt(0)}" isn't something I can work out`);
      if (match[1] !== undefined) tokens.push({ type: 'number', value: Number(match[1]) });
      else if (match[2] !== undefined) tokens.push({ type: 'name', value: match[2].toLowerCase() });
      else {
        const symbol = match[3] === '**' ? '^' : (SYMBOLS[match[3]] ?? match[3]);
        tokens.push({ type: 'symbol', value: symbol });
      }
      if (TOKEN_PATTERN.lastIndex === start) break;
    }
    return tokens;
  }

  function calc(expression, { angle = 'rad' } = {}) {
    const tokens = read_tokens(expression);
    if (tokens.length === 0) throw new Error('Type something to work out');
    let position = 0;
    const peek = () => tokens[position];
    const is_symbol = (value) => peek()?.type === 'symbol' && peek().value === value;
    const take = () => tokens[position++];

    function expect_symbol(value) {
      if (!is_symbol(value)) throw new Error(value === ')' ? 'A bracket is missing' : `Expected "${value}"`);
      take();
    }

    function apply_function(name, values) {
      const run = CALC_FUNCTIONS[name];
      if (TRIG.includes(name) && angle === 'deg') {
        const result = run(values[0] * DEGREES);
        return Math.abs(result) < 1e-12 ? 0 : result;
      }
      const result = run(...values);
      return INVERSE_TRIG.includes(name) && angle === 'deg' ? result / DEGREES : result;
    }

    function read_primary() {
      const token = take();
      if (!token) throw new Error('Something is missing at the end');
      if (token.type === 'number') return token.value;
      if (token.type === 'symbol' && token.value === '(') {
        const value = read_sum();
        expect_symbol(')');
        return value;
      }
      if (token.type === 'name') {
        if (token.value === 'ans') return last_answer;
        if (token.value in CONSTANTS) return CONSTANTS[token.value];
        if (token.value in CALC_FUNCTIONS) {
          if (is_symbol('(')) {
            take();
            const values = [read_sum()];
            while (is_symbol(',')) {
              take();
              values.push(read_sum());
            }
            expect_symbol(')');
            return apply_function(token.value, values);
          }
          return apply_function(token.value, [read_power()]);
        }
        throw new Error(`I don't know "${token.value}"`);
      }
      throw new Error(`"${token.value}" is in the wrong place`);
    }

    function read_postfix() {
      let value = read_primary();
      while (is_symbol('!') || is_symbol('%')) {
        if (take().value === '%') value /= 100;
        else {
          if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error('Factorials need a whole number from 0 to 170');
          let product = 1;
          for (let factor = 2; factor <= value; factor += 1) product *= factor;
          value = product;
        }
      }
      return value;
    }

    function read_power() {
      const base = read_postfix();
      if (!is_symbol('^')) return base;
      take();
      return base ** read_unary();
    }

    function read_unary() {
      if (is_symbol('-')) {
        take();
        return -read_unary();
      }
      if (is_symbol('+')) {
        take();
        return read_unary();
      }
      return read_power();
    }

    // A number, name or bracket straight after a value multiplies it: 2pi, 3(4), (1)(2).
    const starts_value = () => {
      const token = peek();
      return token && (token.type === 'number' || token.type === 'name' || (token.type === 'symbol' && token.value === '('));
    };

    function read_product() {
      let value = read_unary();
      for (;;) {
        if (is_symbol('*') || is_symbol('/')) {
          const operator = take().value;
          const right = read_unary();
          value = operator === '*' ? value * right : value / right;
        } else if (starts_value()) value *= read_unary();
        else return value;
      }
    }

    function read_sum() {
      let value = read_product();
      while (is_symbol('+') || is_symbol('-')) {
        const operator = take().value;
        const right = read_product();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    const result = read_sum();
    if (position < tokens.length) throw new Error(is_symbol(')') ? 'There is an extra bracket' : `"${peek().value}" is in the wrong place`);
    if (!Number.isFinite(result)) throw new Error(Number.isNaN(result) ? "That doesn't have an answer" : "That's too big to work out (or divides by zero)");
    // Removes floating point noise, so 0.1 + 0.2 is 0.3.
    last_answer = Number(result.toPrecision(15));
    return last_answer;
  }

  function format(number, { digits = 10 } = {}) {
    if (!Number.isFinite(number)) return '–';
    if (number === 0) return '0';
    const size = Math.abs(number);
    if (size >= 1e15 || size < 1e-6) return number.toExponential(digits - 1).replace(/\.?0+e/, 'e').replace('e+', 'e');
    return number.toLocaleString('en-US', { maximumSignificantDigits: digits });
  }

  // Units: each category's units with their size in the category's base unit (or, for
  // temperature, how to get to and from kelvin).
  const UNIT_TABLE = {
    length: [['nm', 'Nanometres', 1e-9], ['µm', 'Micrometres', 1e-6], ['mm', 'Millimetres', 1e-3], ['cm', 'Centimetres', 1e-2], ['m', 'Metres', 1], ['km', 'Kilometres', 1e3], ['in', 'Inches', 0.0254], ['ft', 'Feet', 0.3048], ['yd', 'Yards', 0.9144], ['mi', 'Miles', 1609.344], ['nmi', 'Nautical miles', 1852]],
    mass: [['mg', 'Milligrams', 1e-6], ['g', 'Grams', 1e-3], ['kg', 'Kilograms', 1], ['t', 'Tonnes', 1e3], ['oz', 'Ounces', 0.028349523125], ['lb', 'Pounds', 0.45359237], ['st', 'Stone', 6.35029318]],
    time: [['ms', 'Milliseconds', 1e-3], ['s', 'Seconds', 1], ['min', 'Minutes', 60], ['h', 'Hours', 3600], ['day', 'Days', 86400], ['week', 'Weeks', 604800], ['year', 'Years', 31557600]],
    volume: [['mL', 'Millilitres', 1e-3], ['cm3', 'Cubic centimetres', 1e-3], ['L', 'Litres', 1], ['m3', 'Cubic metres', 1e3], ['tsp', 'Teaspoons (US)', 0.00492892159375], ['tbsp', 'Tablespoons (US)', 0.01478676478125], ['floz', 'Fluid ounces (US)', 0.0295735295625], ['cup', 'Cups (US)', 0.2365882365], ['pt', 'Pints (US)', 0.473176473], ['qt', 'Quarts (US)', 0.946352946], ['gal', 'Gallons (US)', 3.785411784]],
    area: [['mm2', 'Square millimetres', 1e-6], ['cm2', 'Square centimetres', 1e-4], ['m2', 'Square metres', 1], ['ha', 'Hectares', 1e4], ['km2', 'Square kilometres', 1e6], ['in2', 'Square inches', 0.00064516], ['ft2', 'Square feet', 0.09290304], ['yd2', 'Square yards', 0.83612736], ['acre', 'Acres', 4046.8564224], ['mi2', 'Square miles', 2589988.110336]],
    speed: [['m/s', 'Metres per second', 1], ['km/h', 'Kilometres per hour', 1 / 3.6], ['mph', 'Miles per hour', 0.44704], ['ft/s', 'Feet per second', 0.3048], ['knot', 'Knots', 1852 / 3600]],
    data: [['bit', 'Bits', 0.125], ['B', 'Bytes', 1], ['KB', 'Kilobytes', 1e3], ['MB', 'Megabytes', 1e6], ['GB', 'Gigabytes', 1e9], ['TB', 'Terabytes', 1e12], ['KiB', 'Kibibytes', 1024], ['MiB', 'Mebibytes', 1048576], ['GiB', 'Gibibytes', 1073741824]],
    energy: [['J', 'Joules', 1], ['kJ', 'Kilojoules', 1e3], ['cal', 'Calories', 4.184], ['kcal', 'Kilocalories', 4184], ['Wh', 'Watt hours', 3600], ['kWh', 'Kilowatt hours', 3.6e6], ['eV', 'Electronvolts', 1.602176634e-19]],
    pressure: [['Pa', 'Pascals', 1], ['kPa', 'Kilopascals', 1e3], ['bar', 'Bar', 1e5], ['atm', 'Atmospheres', 101325], ['mmHg', 'Millimetres of mercury', 133.322387415], ['psi', 'Pounds per square inch', 6894.757293168]],
    force: [['N', 'Newtons', 1], ['kN', 'Kilonewtons', 1e3], ['dyn', 'Dynes', 1e-5], ['lbf', 'Pounds-force', 4.4482216152605]],
    power: [['W', 'Watts', 1], ['kW', 'Kilowatts', 1e3], ['MW', 'Megawatts', 1e6], ['hp', 'Horsepower', 745.69987158227]],
    angle: [['deg', 'Degrees', DEGREES], ['rad', 'Radians', 1], ['grad', 'Gradians', Math.PI / 200], ['turn', 'Turns', 2 * Math.PI]],
  };
  const TEMPERATURE = {
    C: { label: 'Celsius', to_kelvin: (value) => value + 273.15, from_kelvin: (value) => value - 273.15 },
    F: { label: 'Fahrenheit', to_kelvin: (value) => ((value - 32) * 5) / 9 + 273.15, from_kelvin: (value) => ((value - 273.15) * 9) / 5 + 32 },
    K: { label: 'Kelvin', to_kelvin: (value) => value, from_kelvin: (value) => value },
  };
  const units = { temperature: Object.entries(TEMPERATURE).map(([id, unit]) => ({ id, label: unit.label })) };
  Object.entries(UNIT_TABLE).forEach(([category, rows]) => {
    units[category] = rows.map(([id, label]) => ({ id, label }));
  });

  // A unit by its id (exactly, or ignoring case): { category, id }, or null.
  function find_unit(unit_id) {
    const wanted = String(unit_id).replace(/^°/, '');
    for (const [category, list] of Object.entries(units)) {
      const exact = list.find((unit) => unit.id === wanted);
      if (exact) return { category, id: exact.id };
    }
    for (const [category, list] of Object.entries(units)) {
      const loose = list.find((unit) => unit.id.toLowerCase() === wanted.toLowerCase() || unit.label.toLowerCase() === wanted.toLowerCase());
      if (loose) return { category, id: loose.id };
    }
    return null;
  }

  function convert(value, from_id, to_id) {
    const from = find_unit(from_id);
    const to = find_unit(to_id);
    if (!from || !to) throw new Error(`I don't know the unit "${from ? to_id : from_id}"`);
    if (from.category !== to.category) throw new Error(`Can't convert ${from.category} to ${to.category}`);
    const amount = Number(value);
    if (from.category === 'temperature') return Number(TEMPERATURE[to.id].from_kelvin(TEMPERATURE[from.id].to_kelvin(amount)).toPrecision(15));
    const factor = (unit_id) => UNIT_TABLE[from.category].find((row) => row[0] === unit_id)[2];
    return Number(((amount * factor(from.id)) / factor(to.id)).toPrecision(15));
  }

  function save(data) {
    const text = JSON.stringify(data ?? null);
    if (text === undefined || text.length > config.state_max_length) return false;
    saved_state = JSON.parse(text);
    app_window.parent.postMessage({ type: config.save_message, state: saved_state }, '*');
    return true;
  }

  function load() {
    return saved_state === null ? null : JSON.parse(JSON.stringify(saved_state));
  }

  app_window.kit = {
    calc,
    format,
    units,
    convert,
    save,
    load,
    size: read_size,
    on_size: (listener) => size_listeners.push(listener),
  };
}
