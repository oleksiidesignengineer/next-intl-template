/**
 * URLSearchParams → the `query` object of next-intl's href, keeping
 * multi-valued params (?tag=a&tag=b → { tag: ['a', 'b'] }). A plain
 * Object.fromEntries(params) keeps only the last value of each key.
 */
export function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    result[key] = values.length === 1 ? values[0] : values
  }
  return result
}
