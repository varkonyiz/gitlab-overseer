// jsdom lacks some browser APIs that Siemens iX web components use; provide inert stand-ins for unit tests.
class NoopObserver {
  observe(): void {
    // no-op
  }
  unobserve(): void {
    // no-op
  }
  disconnect(): void {
    // no-op
  }
  takeRecords(): [] {
    return [];
  }
}

const g = globalThis as Record<string, unknown>;
g['IntersectionObserver'] ??= NoopObserver;
g['ResizeObserver'] ??= NoopObserver;

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Form-associated iX inputs (ix-number-input, ix-input) report their value through ElementInternals.
const internals = (g['ElementInternals'] as { prototype: Record<string, unknown> } | undefined)
  ?.prototype;
if (internals) {
  internals['setFormValue'] ??= () => undefined;
  internals['setValidity'] ??= () => undefined;
}
