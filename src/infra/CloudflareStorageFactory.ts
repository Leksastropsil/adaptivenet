import { IStore } from "../types/storage";
import { CloudflareKVDriver } from "./drivers/CloudflareKVDriver";

export class CloudflareStorageFactory {
  public static create(kv: KVNamespace): IStore {
    return new CloudflareKVDriver(kv);
  }
}
