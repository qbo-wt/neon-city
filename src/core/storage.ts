type KV = Pick<Storage, 'getItem' | 'setItem'>;

let memory: Map<string, string> | undefined;

/** localStorage, or an in-memory fallback when the browser blocks it (private mode, file://, policies). */
export function getStorage(): KV {
  try {
    const ls = window.localStorage;
    ls.getItem('probe');
    return ls;
  } catch {
    memory ??= new Map();
    return { getItem: k => memory!.get(k) ?? null, setItem: (k, v) => void memory!.set(k, v) };
  }
}
