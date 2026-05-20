declare module 'react' {
  export type ReactNode = unknown;
  export type CSSProperties = Record<string, string | number>;
  export type EffectCallback = () => void | (() => void);
  export type FunctionComponent<P = Record<string, unknown>> = (props: P) => unknown;

  const React: {
    createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
    useEffect: (effect: EffectCallback, deps?: unknown[]) => void;
  };

  export default React;
  export const createContext: <T>(value: T) => { Provider: FunctionComponent<{ value: T; children: ReactNode }> };
  export const useContext: <T>(context: unknown) => T;
}

declare namespace React {
  type ReactNode = unknown;
  type CSSProperties = Record<string, string | number>;
}

declare module 'react-dom/client' {
  export function createRoot(element: Element): { render(children: unknown): void };
}

declare module 'react-dom/server' {
  export function renderToStaticMarkup(element: unknown): string;
}

declare module 'react/jsx-runtime' {
  export function jsx(type: unknown, props: Record<string, unknown>, key?: unknown): unknown;
  export function jsxs(type: unknown, props: Record<string, unknown>, key?: unknown): unknown;
  export const Fragment: unknown;
}

declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
}
