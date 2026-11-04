import type { Dict } from '../../i18n';
export declare const loadPlayer: (
  lang: string
) => Promise<{ startPlayer: typeof import('./player').startPlayer; strings: Dict['topology'] }>;
