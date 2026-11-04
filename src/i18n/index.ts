// Locales and their URLs. The default locale lives at the root (/writing/), every other one under
// its prefix (/ru/writing/). Pages sit in src/pages/[...locale]/ and build once per locale from
// localeStaticPaths(). A third language: a new <locale>.ts typed as Dict, then add it to DICTS.
import { en } from './en';
import { ru } from './ru';

// String literals widen to string; functions keep their signature; nesting is kept. `as const` on
// en makes it the single source of keys: a locale missing a key or adding one does not compile.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { readonly [K in keyof T]: Widen<T[K]> };
export type Dict = Widen<typeof en>;

const DICTS = { en, ru } satisfies Record<string, Dict>;
export type Locale = keyof typeof DICTS;
export const LOCALES = Object.keys(DICTS) as Locale[];
export const DEFAULT_LOCALE: Locale = 'en';
export const SITE = 'https://rossev.dev';

// Types are not checked by `astro build`, so the build also fails on a key set mismatch.
const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const reference = keys(DICTS[DEFAULT_LOCALE]).sort().join('\n');
for (const l of LOCALES) {
  if (keys(DICTS[l]).sort().join('\n') !== reference) throw new Error(`i18n: ${l} does not have the same keys as ${DEFAULT_LOCALE}`);
}

export const t = (lang: Locale): Dict => DICTS[lang];

export const isLocale = (s: string | undefined): s is Locale => !!s && (LOCALES as string[]).includes(s);

// getStaticPaths for a page under src/pages/[...locale]/: the default locale has no segment.
export const localeParams = () => LOCALES.map((l) => ({ locale: l === DEFAULT_LOCALE ? undefined : l }));
export const localeStaticPaths = () => localeParams().map((params) => ({ params }));
export const localeOf = (param: string | undefined): Locale => (isLocale(param) ? param : DEFAULT_LOCALE);

// A site path in a locale: localePath('ru', '/writing/') -> '/ru/writing/'. Keeps ?query and #hash.
export const localePath = (lang: Locale, path: string) => (lang === DEFAULT_LOCALE ? path : `/${lang}${path}`);

// The locale and the locale-free path of a URL pathname: '/ru/writing/' -> ['ru', '/writing/'].
export function splitLocale(pathname: string): [Locale, string] {
  const m = pathname.match(/^\/([a-z]{2})(\/.*|$)/);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) return [m[1], m[2] || '/'];
  return [DEFAULT_LOCALE, pathname];
}
