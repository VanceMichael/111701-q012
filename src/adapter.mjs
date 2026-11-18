export function normalizePage(page) {
  return page.items.map((item) => {
    if (!item.id || !item.label || !item.state) {
      throw new Error('来源记录缺少 id、label 或 state');
    }
    return {
      source: page.source,
      id: String(item.id),
      name: String(item.label).trim(),
      state: String(item.state),
      revision: Number(item.revision ?? 0),
      observedAt: page.observedAt ?? null,
    };
  });
}

const QUOTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeQuotePage(page) {
  if (!page?.source || !Array.isArray(page.items)) {
    throw new Error('来源页缺少 source 或 items');
  }
  return page.items.map((item) => normalizeQuote(item, page));
}

function normalizeQuote(item, page) {
  if (!item || typeof item !== 'object') {
    throw new Error('报价记录必须是对象');
  }
  for (const field of ['id', 'material', 'requestedSpec', 'quotedSpec', 'unit']) {
    if (item[field] === undefined || item[field] === null || String(item[field]).trim() === '') {
      throw new Error(`报价记录缺少 ${field}`);
    }
  }
  if (item.price === undefined || item.price === null || item.price === '') {
    throw new Error('报价记录缺少 price');
  }
  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`报价 ${item.id} 的 price 必须为正数`);
  }
  const packSize = item.packSize === undefined ? 1 : Number(item.packSize);
  if (!Number.isInteger(packSize) || packSize <= 0) {
    throw new Error(`报价 ${item.id} 的 packSize 必须为正整数`);
  }
  const validUntil = item.validUntil ?? null;
  if (
    validUntil !== null &&
    (typeof validUntil !== 'string' ||
      !QUOTE_DATE_PATTERN.test(validUntil) ||
      Number.isNaN(Date.parse(validUntil)))
  ) {
    throw new Error(`报价 ${item.id} 的 validUntil 必须是 YYYY-MM-DD 日期`);
  }
  const baseUnit = String(item.baseUnit ?? '').trim();
  return {
    source: page.source,
    id: String(item.id),
    material: String(item.material).trim(),
    requestedSpec: String(item.requestedSpec).trim(),
    quotedSpec: String(item.quotedSpec).trim(),
    unit: String(item.unit).trim(),
    baseUnit: baseUnit === '' ? '件' : baseUnit,
    packSize,
    price,
    validUntil,
    note: item.note === undefined || item.note === null ? null : String(item.note),
    state: String(item.state ?? 'active'),
    revision: Number(item.revision ?? 0),
    observedAt: page.observedAt ?? null,
  };
}
