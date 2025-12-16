import { registry, type MiddlewareMeta } from './registry.js';

type MiddlewareKey = (typeof registry)[number]['key'];
type MiddlewareFactory = MiddlewareMeta['factory'];

export type MiddlewareFactoryMap = Record<MiddlewareKey, MiddlewareFactory>;

const middlewareEntries = registry.map(
  ({ key, factory }) => [key, factory] as const
);

export const middlewareExports = Object.fromEntries(
  middlewareEntries
) satisfies MiddlewareFactoryMap;
