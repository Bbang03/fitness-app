/**
 * Let Node's native TypeScript stripping resolve the extensionless relative
 * imports used by the Next.js codebase when running small local demos/tests.
 * This file has no runtime dependency and is only used from npm scripts.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(
      new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
      context,
      nextResolve,
    );
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !/[.]([cm]?js|json|ts|tsx)$/.test(specifier)
  ) {
    return nextResolve(`${specifier}.ts`, context, nextResolve);
  }

  return nextResolve(specifier, context, nextResolve);
}
