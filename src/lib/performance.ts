function names(operation: string) {
  const measure = `duckdaw:${operation}`;
  return { measure, start: `${measure}:start`, end: `${measure}:end` };
}

function finish(operation: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  const name = names(operation);
  performance.mark(name.end);
  performance.measure(name.measure, name.start, name.end);
  performance.clearMarks?.(name.start);
  performance.clearMarks?.(name.end);
}

export function measurePerf<T>(operation: string, task: () => T): T {
  const name = names(operation);
  performance?.mark?.(name.start);
  try {
    return task();
  } finally {
    finish(operation);
  }
}

export async function measurePerfAsync<T>(operation: string, task: () => Promise<T>): Promise<T> {
  const name = names(operation);
  performance?.mark?.(name.start);
  try {
    return await task();
  } finally {
    finish(operation);
  }
}
