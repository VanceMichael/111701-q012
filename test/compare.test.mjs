import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuotePage } from '../src/adapter.mjs';
import { compareQuotes, isExpired, isSubstitute, unitPriceOf } from '../src/compare.mjs';
import { collect } from '../src/pipeline.mjs';
import { readSource } from '../src/source.mjs';
import { RecordStore } from '../src/store.mjs';

const AS_OF = '2026-11-18';
const SUPPLIER_A = new URL('../data/supplier-a.json', import.meta.url);
const SUPPLIER_B = new URL('../data/supplier-b.json', import.meta.url);

async function collectQuotes(...paths) {
  const store = new RecordStore();
  for (const path of paths) {
    await collect({ source: () => readSource(path), store, normalize: normalizeQuotePage });
  }
  return store;
}

test('箱报价与单件报价折算到同一基本单位后排序，原包装报价保留', async () => {
  const store = await collectQuotes(SUPPLIER_A, SUPPLIER_B);
  const result = compareQuotes(store.list(), { asOf: AS_OF });
  const group = result.groups.find((g) => g.material === '五孔插座面板');
  assert.equal(group.exact.length, 2);
  assert.deepEqual(
    group.exact.map((e) => [e.source, e.unitPrice]),
    [
      ['supplier-a', 18],
      ['supplier-b', 19.5],
    ],
  );
  assert.deepEqual(group.exact[0].quoted, { unit: '箱', packSize: 50, price: 900 });
  assert.deepEqual(group.exact[1].quoted, { unit: '件', packSize: 1, price: 19.5 });
  assert.equal(group.exact[0].baseUnit, '件');
});

test('相近规格替代建议单列，不与一致规格混排', async () => {
  const store = await collectQuotes(SUPPLIER_A, SUPPLIER_B);
  const result = compareQuotes(store.list(), { asOf: AS_OF });
  const group = result.groups.find((g) => g.material === 'LED 平板灯');
  assert.equal(group.requestedSpec, '300×300 24W');
  assert.deepEqual(
    group.exact.map((e) => e.source),
    ['supplier-b'],
  );
  assert.equal(group.exact[0].quotedSpec, '300×300 24W');
  assert.deepEqual(
    group.substitutes.map((e) => e.source),
    ['supplier-a'],
  );
  assert.equal(group.substitutes[0].quotedSpec, '300×300 20W');
  assert.match(group.substitutes[0].note, /24W 缺货/);
});

test('过期报价退出当前可比结果，仅在 expired 留痕', async () => {
  const store = await collectQuotes(SUPPLIER_A, SUPPLIER_B);
  const result = compareQuotes(store.list(), { asOf: AS_OF });
  const group = result.groups.find((g) => g.material === 'PPR 给水管');
  assert.deepEqual(
    group.exact.map((e) => e.source),
    ['supplier-a'],
  );
  assert.equal(group.exact[0].unitPrice, 18);
  assert.equal(group.substitutes.length, 0);
  assert.deepEqual(
    group.expired.map((e) => e.source),
    ['supplier-b'],
  );
  assert.equal(group.expired[0].unitPrice, 17);
});

test('比较结果按材料与要求规格分组，不汇总成单一最低价', async () => {
  const store = await collectQuotes(SUPPLIER_A, SUPPLIER_B);
  const result = compareQuotes(store.list(), { asOf: AS_OF });
  assert.equal(result.asOf, AS_OF);
  assert.equal(result.groups.length, 3);
  assert.ok(!('lowest' in result));
  for (const group of result.groups) {
    assert.ok(!('lowest' in group));
    assert.ok(Array.isArray(group.exact));
    assert.ok(Array.isArray(group.substitutes));
    assert.ok(Array.isArray(group.expired));
  }
});

test('两家供应商报价归档后身份不重复', async () => {
  const store = await collectQuotes(SUPPLIER_A, SUPPLIER_B);
  assert.equal(store.list().length, 6);
});

test('缺省有效期视为长期有效，缺省基本单位为件', () => {
  const [quote] = normalizeQuotePage({
    source: 's',
    items: [{ id: 'q', material: 'm', requestedSpec: 'r', quotedSpec: 'r', unit: '件', price: 10 }],
  });
  assert.equal(quote.validUntil, null);
  assert.equal(quote.baseUnit, '件');
  assert.equal(quote.state, 'active');
  assert.equal(isExpired(quote, AS_OF), false);
  assert.equal(isSubstitute(quote), false);
  assert.equal(unitPriceOf(quote), 10);
});

test('有效期当日仍有效，早于比较日才过期', () => {
  assert.equal(isExpired({ validUntil: '2026-11-18' }, '2026-11-18'), false);
  assert.equal(isExpired({ validUntil: '2026-11-17' }, '2026-11-18'), true);
});

test('替代判定基于所报规格与要求规格是否一致', () => {
  assert.equal(isSubstitute({ requestedSpec: 'DN20×2.8', quotedSpec: 'DN20×2.8' }), false);
  assert.equal(isSubstitute({ requestedSpec: 'DN20×2.8', quotedSpec: 'DN20×3.4' }), true);
});

test('不完整或非法报价被拒绝', () => {
  const base = { id: 'q', material: 'm', requestedSpec: 'r', quotedSpec: 'r', unit: '件', price: 1 };
  const page = (item) => ({ source: 's', items: [item] });
  assert.throws(
    () => normalizeQuotePage(page({ material: 'm', requestedSpec: 'r', quotedSpec: 'r', unit: '件', price: 1 })),
    /缺少 id/,
  );
  assert.throws(() => normalizeQuotePage(page({ ...base, quotedSpec: undefined })), /缺少 quotedSpec/);
  assert.throws(() => normalizeQuotePage(page({ ...base, price: undefined })), /缺少 price/);
  assert.throws(() => normalizeQuotePage(page({ ...base, price: -1 })), /price 必须为正数/);
  assert.throws(() => normalizeQuotePage(page({ ...base, packSize: 0 })), /packSize 必须为正整数/);
  assert.throws(() => normalizeQuotePage(page({ ...base, packSize: 2.5 })), /packSize 必须为正整数/);
  assert.throws(() => normalizeQuotePage(page({ ...base, validUntil: '11月18日' })), /validUntil/);
  assert.throws(() => normalizeQuotePage(page(null)), /对象/);
  assert.throws(() => normalizeQuotePage({ items: [] }), /source 或 items/);
});

test('比较日期必须是 ISO 日期', () => {
  assert.throws(() => compareQuotes([], { asOf: '2026/11/18' }), /asOf/);
});
