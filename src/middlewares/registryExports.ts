import { registry, type MiddlewareMeta } from './registry.js';

type MiddlewareKey = (typeof registry)[number]['key'];
type MiddlewareFactory = MiddlewareMeta['factory'];

export type MiddlewareFactoryMap = Record<MiddlewareKey, MiddlewareFactory>;

export const middlewareExports: MiddlewareFactoryMap = Object.fromEntries(
  registry.map(({ key, factory }) => [key, factory])
) as MiddlewareFactoryMap;
