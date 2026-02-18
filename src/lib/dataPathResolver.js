/**
 * Resolve a dot-notation data path against loaded quote/audit data.
 *
 * Supports:
 *   - Simple paths: "customer.name" → data.customer.name
 *   - Aggregations: "audit_areas.fixture_count.sum" → sum of all audit_areas[].fixture_count
 *   - Computed: "today" → today's date as MM/DD/YYYY
 *
 * @param {string} path - e.g. "customer.name" or "audit_areas.fixture_count.sum"
 * @param {object} data - full data context with keys: customer, audit, quote, provider, salesperson, audit_areas, lines
 * @returns {string} resolved value or empty string
 */
export function resolveDataPath(path, data) {
  if (!path || !data) return '';

  // Computed values
  if (path === 'today') {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  }

  // Aggregation paths: "collection.field.agg"
  const aggMatch = path.match(/^(\w+)\.(\w+)\.(sum|count|avg|min|max|join)$/);
  if (aggMatch) {
    const [, collection, field, agg] = aggMatch;
    const items = data[collection];
    if (!Array.isArray(items) || items.length === 0) return '';
    const values = items.map((item) => item[field]).filter((v) => v !== null && v !== undefined);

    switch (agg) {
      case 'sum': return String(values.reduce((a, b) => Number(a) + Number(b), 0));
      case 'count': return String(values.length);
      case 'avg': return values.length ? String(values.reduce((a, b) => Number(a) + Number(b), 0) / values.length) : '';
      case 'min': return String(Math.min(...values.map(Number)));
      case 'max': return String(Math.max(...values.map(Number)));
      case 'join': return values.join(', ');
      default: return '';
    }
  }

  // Simple dot path: "section.field"
  const parts = path.split('.');
  let current = data;
  for (const part of parts) {
    if (current === null || current === undefined) return '';
    current = current[part];
  }

  if (current === null || current === undefined) return '';
  return String(current);
}

/**
 * Given a field_mapping and data context, resolve all mappings to values.
 * @param {Record<string, string>} fieldMapping - { pdfFieldName: dataPath }
 * @param {object} data - full data context
 * @returns {Record<string, string>} - { pdfFieldName: resolvedValue }
 */
export function resolveAllMappings(fieldMapping, data) {
  const result = {};
  for (const [pdfField, dataPath] of Object.entries(fieldMapping)) {
    result[pdfField] = resolveDataPath(dataPath, data);
  }
  return result;
}
