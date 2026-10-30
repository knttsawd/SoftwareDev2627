// Finished app widgets, written the way the app builder should write them: the kit's
// classes and window.kit (see the client's utils/app_kit.js), a compact version, keyboard
// support and saved settings. The builder's prompt shows them as examples, and practice
// mode (the mock provider) makes them when asked for a calculator or a converter.

export const CALCULATOR_APP = `<div class="stack">
<div class="display"><div class="expression" id="expression"></div><div class="result" id="result" aria-live="polite">0</div></div>
<div class="segmented hide-compact" role="group" aria-label="Angles"><button type="button" data-angle="deg">Degrees</button><button type="button" data-angle="rad">Radians</button></div>
<div class="keypad">
<button type="button" class="hide-compact" data-insert="sin(">sin</button><button type="button" class="hide-compact" data-insert="cos(">cos</button><button type="button" class="hide-compact" data-insert="tan(">tan</button><button type="button" class="hide-compact" data-insert="√(" aria-label="Square root">√</button>
<button type="button" class="hide-compact" data-insert="^" aria-label="Power">xʸ</button><button type="button" class="hide-compact" data-insert="π" aria-label="Pi">π</button><button type="button" class="hide-compact" data-insert="log(">log</button><button type="button" class="hide-compact" data-insert="ln(">ln</button>
<button type="button" class="muted" data-action="clear" aria-label="Clear">AC</button><button type="button" class="muted" data-insert="(">(</button><button type="button" class="muted" data-insert=")">)</button><button type="button" class="accent" data-insert="÷" aria-label="Divide">÷</button>
<button type="button" data-insert="7">7</button><button type="button" data-insert="8">8</button><button type="button" data-insert="9">9</button><button type="button" class="accent" data-insert="×" aria-label="Times">×</button>
<button type="button" data-insert="4">4</button><button type="button" data-insert="5">5</button><button type="button" data-insert="6">6</button><button type="button" class="accent" data-insert="−" aria-label="Minus">−</button>
<button type="button" data-insert="1">1</button><button type="button" data-insert="2">2</button><button type="button" data-insert="3">3</button><button type="button" class="accent" data-insert="+" aria-label="Plus">+</button>
<button type="button" data-insert="0">0</button><button type="button" data-insert=".">.</button><button type="button" class="muted" data-action="delete" aria-label="Delete">⌫</button><button type="button" class="accent" data-action="equals" aria-label="Equals">=</button>
</div>
<div class="only-large stack"><p class="label">Recent</p><ul class="stack muted" id="history"></ul></div>
</div>
<script>
const saved = kit.load() || {};
let expression = '';
let angle = saved.angle || 'deg';
let history = saved.history || [];
const expression_line = document.getElementById('expression');
const result_line = document.getElementById('result');
const history_list = document.getElementById('history');

function show() {
  expression_line.textContent = expression;
  document.querySelectorAll('[data-angle]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.angle === angle)));
  history_list.replaceChildren(...history.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
}
function equals() {
  if (!expression) return;
  try {
    const answer = kit.format(kit.calc(expression, { angle }));
    history = [expression + ' = ' + answer, ...history].slice(0, 5);
    result_line.textContent = answer;
    expression = '';
    kit.save({ angle, history });
  } catch (error) {
    result_line.textContent = error.message;
  }
  show();
}
function press(insert, action) {
  if (action === 'clear') { expression = ''; result_line.textContent = '0'; }
  else if (action === 'delete') expression = expression.slice(0, -1);
  else if (action === 'equals') return equals();
  else expression += insert;
  show();
}
document.querySelector('.keypad').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) press(button.dataset.insert, button.dataset.action);
});
document.querySelectorAll('[data-angle]').forEach((button) => button.addEventListener('click', () => { angle = button.dataset.angle; kit.save({ angle, history }); show(); }));
document.addEventListener('keydown', (event) => {
  if (/^[0-9.+\\-*/^()%!]$/.test(event.key)) press(event.key);
  else if (event.key === 'Enter' || event.key === '=') { event.preventDefault(); press('', 'equals'); }
  else if (event.key === 'Backspace') press('', 'delete');
  else if (event.key === 'Escape') press('', 'clear');
});
show();
</script>`;

export const CONVERTER_APP = `<div class="stack">
<div class="field"><label for="category">Measure</label><select id="category"></select></div>
<div class="row"><div class="field"><label for="amount">Amount</label><input id="amount" type="number" step="any" value="1"></div><div class="field"><label for="from">From</label><select id="from"></select></div></div>
<div class="row"><div class="field"><label for="to">To</label><select id="to"></select></div><button type="button" class="secondary" id="swap" aria-label="Swap the units">⇅ Swap</button></div>
<div class="tile"><p class="big" id="answer" aria-live="polite"></p><p class="muted hide-compact" id="rate"></p></div>
</div>
<script>
const saved = kit.load() || {};
const category = document.getElementById('category');
const amount = document.getElementById('amount');
const from = document.getElementById('from');
const to = document.getElementById('to');
const answer = document.getElementById('answer');
const rate = document.getElementById('rate');

function fill(select, options, chosen) {
  select.replaceChildren(...options.map((option) => new Option(option.label, option.id)));
  select.value = options.some((option) => option.id === chosen) ? chosen : options[0].id;
}
function pick_category(name, from_id, to_id) {
  const units = kit.units[name];
  fill(from, units, from_id);
  fill(to, units, to_id || units[1].id);
}
function update() {
  const value = Number(amount.value);
  if (amount.value === '' || !Number.isFinite(value)) {
    answer.textContent = 'Type an amount';
    rate.textContent = '';
    return;
  }
  const result = kit.convert(value, from.value, to.value);
  answer.textContent = kit.format(result) + ' ' + to.value;
  rate.textContent = '1 ' + from.value + ' = ' + kit.format(kit.convert(1, from.value, to.value)) + ' ' + to.value;
}
function remember() {
  kit.save({ category: category.value, from: from.value, to: to.value });
}
fill(category, Object.keys(kit.units).map((name) => ({ id: name, label: name[0].toUpperCase() + name.slice(1) })), saved.category || 'length');
pick_category(category.value, saved.from || 'km', saved.to || 'mi');
category.addEventListener('change', () => { pick_category(category.value); update(); remember(); });
amount.addEventListener('input', update);
[from, to].forEach((select) => select.addEventListener('change', () => { update(); remember(); }));
document.getElementById('swap').addEventListener('click', () => { [from.value, to.value] = [to.value, from.value]; update(); remember(); });
update();
</script>`;

// A small app for anything else in practice mode: a tally counter that remembers its count.
export const COUNTER_APP = `<div class="stack">
<p class="big" id="count" aria-live="polite">0</p>
<div class="row"><button type="button" id="add">Add one</button><button type="button" class="secondary" id="take">Take one</button><button type="button" class="ghost hide-compact" id="reset">Reset</button></div>
</div>
<script>
let count = (kit.load() || {}).count || 0;
const shown = document.getElementById('count');
function show() { shown.textContent = kit.format(count); }
function set(value) { count = Math.max(0, value); show(); kit.save({ count }); }
document.getElementById('add').addEventListener('click', () => set(count + 1));
document.getElementById('take').addEventListener('click', () => set(count - 1));
document.getElementById('reset').addEventListener('click', () => set(0));
show();
</script>`;

// Practice mode's app builder: the calculator or converter when the title or brief asks for
// one, otherwise the counter. Same shape as the real builder's answer.
export function build_mock_widget_app({ title, brief }) {
  const request_text = `${title} ${brief}`;
  if (/convert|units?\b/i.test(request_text)) return { html: CONVERTER_APP, height: 340, summary: 'Converts between units, remembering your last choice.' };
  if (/calculat|maths?\b|arithmetic/i.test(request_text)) return { html: CALCULATOR_APP, height: 470, summary: 'A scientific calculator with degrees and radians and your recent answers.' };
  return { html: COUNTER_APP, height: 160, summary: 'A counter that remembers its count.' };
}
