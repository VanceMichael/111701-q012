import { normalizeQuotePage } from './adapter.mjs';
import { collect } from './pipeline.mjs';
import { readSource } from './source.mjs';
import { RecordStore } from './store.mjs';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function unitPriceOf(quote) {
  return Math.round((quote.price / quote.packSize) * 1e4) / 1e4;
}

export function isSubstitute(quote) {
  return quote.quotedSpec !== quote.requestedSpec;
}

export function isExpired(quote, asOf) {
  return quote.validUntil !== null && quote.validUntil < asOf;
}

export function compareQuotes(quotes, { asOf } = {}) {
  const date = asOf ?? new Date().toISOString().slice(0, 10);
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error(`asOf 必须是 YYYY-MM-DD 日期，收到：${date}`);
  }
  const groups = new Map();
  for (const quote of quotes) {
    const key = `${quote.material}\n${quote.requestedSpec}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        material: quote.material,
        requestedSpec: quote.requestedSpec,
        exact: [],
        substitutes: [],
        expired: [],
      };
      groups.set(key, group);
    }
    const entry = toEntry(quote);
    if (isExpired(quote, date)) {
      group.expired.push(entry);
    } else if (isSubstitute(quote)) {
      group.substitutes.push(entry);
    } else {
      group.exact.push(entry);
    }
  }
  return {
    asOf: date,
    groups: [...groups.values()].sort(compareGroups).map((group) => ({
      ...group,
      exact: sortEntries(group.exact),
      substitutes: sortEntries(group.substitutes),
      expired: sortEntries(group.expired),
    })),
  };
}

function toEntry(quote) {
  return {
    source: quote.source,
    id: quote.id,
    quotedSpec: quote.quotedSpec,
    quoted: { unit: quote.unit, packSize: quote.packSize, price: quote.price },
    unitPrice: unitPriceOf(quote),
    baseUnit: quote.baseUnit,
    validUntil: quote.validUntil,
    note: quote.note ?? null,
  };
}

function sortEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      a.unitPrice - b.unitPrice || compareText(a.source, b.source) || compareText(a.id, b.id),
  );
}

function compareGroups(a, b) {
  return compareText(a.material, b.material) || compareText(a.requestedSpec, b.requestedSpec);
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const asOf = args.find((arg) => arg.startsWith('--as-of='))?.slice('--as-of='.length);
  const paths = args.filter((arg) => !arg.startsWith('--'));
  const files =
    paths.length > 0
      ? paths
      : [
          new URL('../data/supplier-a.json', import.meta.url),
          new URL('../data/supplier-b.json', import.meta.url),
        ];
  const store = new RecordStore();
  for (const file of files) {
    await collect({ source: () => readSource(file), store, normalize: normalizeQuotePage });
  }
  const result = compareQuotes(store.list(), asOf ? { asOf } : {});
  console.log(JSON.stringify(result, null, 2));
}
