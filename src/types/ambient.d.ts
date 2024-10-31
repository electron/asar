/**
 * TODO(erikian): remove this file once we upgrade to the latest `glob` version.
 * https://github.com/electron/asar/pull/332#issuecomment-2435407933
 */
declare module 'glob' {
  export function glob(
    pattern: string,
    options: import('./glob').IOptions,
    cb: (err: Error | null, matches: string[]) => void,
  ): unknown;
}
