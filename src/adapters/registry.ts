import { CoreEngine } from "../core/engine";
import { IAdapter } from "../core/types";
import { LK21Adapter } from "./lk21";

// Registry Map
const adapters: Record<string, any> = {
  lk21: LK21Adapter,
  // idlix: IdlixAdapter
};

/**
 * Factory to get Adapter Instance
 */
export function getAdapter(name: string, engine: CoreEngine): IAdapter {
  const normalized = name.toLowerCase();
  const AdapterClass = adapters[normalized];

  if (!AdapterClass) {
    throw new Error(`Provider '${name}' not found.`);
  }

  return new AdapterClass(engine);
}
