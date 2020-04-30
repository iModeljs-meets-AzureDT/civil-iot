/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeDuration } from "@bentley/bentleyjs-core";

import { AdtDataLink } from "./AdtDataLink";

interface IotDataCacheItem {
  dtId: string;
  assetData: any;
}

/** A component the renders the whole application UI */
export class IotDataPolling {
  private _stopPolling: boolean;
  private _iotDataPollingCache: IotDataCacheItem[];

  private static _singleton: IotDataPolling;

  public static async initialize() {
    if (undefined === IotDataPolling._singleton) {
      IotDataPolling._singleton = new IotDataPolling();
    }
  }

  public static get() {
    return IotDataPolling._singleton;
  }

  public constructor() {
    this._stopPolling = false;
    this._iotDataPollingCache = [];
  }

  public get isPolling(): boolean {
    return this._stopPolling === false;
  }

  public stopPolling() {
    this._stopPolling = true;
  }

  public startPolling() {
    this._stopPolling = false;

    // tslint:disable-next-line: no-floating-promises
    this.doIotDataPolling();
  }

  public async doIotDataPolling() {
    while (!this._stopPolling) {
      this._iotDataPollingCache.map(async (item) => {
        const assetData = await AdtDataLink.get().fetchDataForNode(item.dtId);
        item.assetData = {...assetData};
      });

    // pause 1 second between each polling loop
      await BeDuration.wait(1000);
    }
  }

  public addIotDataListener(dtId: string) {
    this._iotDataPollingCache.push({dtId, assetData: undefined});
  }

  public removeIotDataListener(dtId: string) {
    this._iotDataPollingCache = this._iotDataPollingCache.filter((item) => item.dtId !== dtId);
  }

  public getIotData(dtId: string): any {
    const iotDataCacheItem: IotDataCacheItem | undefined = this._iotDataPollingCache.find((item) => {
      return item.dtId === dtId;
    });
    if (!iotDataCacheItem)
      return undefined;

    return iotDataCacheItem.assetData;
  }
}
