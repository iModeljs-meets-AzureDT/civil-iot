/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { DataLink } from "./DataLink";

export enum CivilDataModelLevel {
  TopNode, Corridor, Subcorridor, Asset,
}

export enum CivilDataModelAssetType {
  Bridge, Tunnel, Road,
}

export interface CivilComponentProps {
  id: string;                           // Id of this component
  label: string;                        // UI label for this component
  composingId: string;                  // Id of the 'parent' component for the UI tree
  level: CivilDataModelLevel;           // tree level
  assetType?: CivilDataModelAssetType;  // only for assets
}

export class CivilDataModel {
  private _topNodes: CivilComponentProps[];       // These don't exist in the iModel
  private _corridors: CivilComponentProps[];
  private _subCorridors: CivilComponentProps[];   // These don't exist in the iModel
  private _assets: CivilComponentProps[];
  private static _singleton: CivilDataModel;

  public static initialize(imodel: IModelConnection) {
    if (undefined === CivilDataModel._singleton) {
      CivilDataModel._singleton = new CivilDataModel();
      CivilDataModel._singleton.load(imodel);
    }
  }

  public static get() {
    return CivilDataModel._singleton;
  }

  public constructor() {
    this._topNodes = [];
    this._corridors = [];
    this._subCorridors = [];
    this._assets = [];
  }

  private async populateTopNodes(_dataLink: DataLink) {
    const level = CivilDataModelLevel.TopNode;
    this._topNodes.push({ id: "0x0001", label: "Interstates", composingId: "", level });
    this._topNodes.push({ id: "0x0002", label: "State Highways", composingId: "", level });
    this._topNodes.push({ id: "0x0003", label: "Local Roadways", composingId: "", level });
  }

  private async populateCorridors(_dataLink: DataLink) {
    const level = CivilDataModelLevel.Corridor;

    // Interstates
    this._corridors.push({ id: "0x0011", label: "Pacific Highway 100", composingId: "0x0001", level });

    // State Highways
    this._corridors.push({ id: "0x0021", label: "SR 202", composingId: "0x0002", level });
    this._corridors.push({ id: "0x0022", label: "SR 73", composingId: "0x0002", level });

    // Local Roadways
    this._corridors.push({ id: "0x0031", label: "Harrison Street", composingId: "0x0003", level });
  }

  private async populateSubcorridors(_dataLink: DataLink) {
    const level = CivilDataModelLevel.Subcorridor;

    // Pacific Highway
    this._subCorridors.push({ id: "0x0101", label: "Mainline", composingId: "0x0011", level });
    this._subCorridors.push({ id: "0x0102", label: "Ramps", composingId: "0x0011", level });
  }

  private async populateAssets(dataLink: DataLink) {
    const level = CivilDataModelLevel.Asset;

    // Pacific Highway Mainline
    const rows = await dataLink.queryAllTunnels();
    for (const row of rows) {
      this._assets.push({ id: row.id, label: row.userLabel, composingId: "0x0101", level });
    }
  }

  public async load(imodel: IModelConnection) {
    const dataLink = new DataLink(imodel);

    this.populateTopNodes(dataLink);
    this.populateCorridors(dataLink);
    this.populateSubcorridors(dataLink);
    this.populateAssets(dataLink);
  }

  private getComponentsForIds(list: CivilComponentProps[], ids: string[]): CivilComponentProps[] {
    return list.filter((item: CivilComponentProps) => (-1 !== ids.indexOf(item.id)));
  }

  private getComponentsForComposingIds(list: CivilComponentProps[], composingIds: string[]): CivilComponentProps[] {
    return list.filter((item: CivilComponentProps) => (-1 !== composingIds.indexOf(item.composingId)));
  }

  private getListForLevel(level: CivilDataModelLevel) {
    switch (level) {
      case CivilDataModelLevel.TopNode: return this._topNodes;
      case CivilDataModelLevel.Corridor: return this._corridors;
      case CivilDataModelLevel.Subcorridor: return this._subCorridors;
      case CivilDataModelLevel.Asset: return this._assets;
    }
  }

  private getChildLevel(level: CivilDataModelLevel) {
    switch (level) {
      case CivilDataModelLevel.TopNode: return CivilDataModelLevel.Corridor;
      case CivilDataModelLevel.Corridor: return CivilDataModelLevel.Subcorridor;
      case CivilDataModelLevel.Subcorridor: return CivilDataModelLevel.Asset;
      case CivilDataModelLevel.Asset: return undefined;
    }
  }

  public getChildren(component: CivilComponentProps) {
    const childLevel = this.getChildLevel(component.level);

    if (undefined === childLevel)
      return [];

    const fullList = this.getListForLevel(childLevel);

    if (undefined === fullList)
      return [];

    return this.getComponentsForComposingIds(fullList, [component.id]);
  }

  public getChildCount(component: CivilComponentProps) {
    return this.getChildren(component).length;
  }

  public getAllTopNodes(): CivilComponentProps[] {
    return this._topNodes;
  }

  public getTopNodesById(topNodeIds: string[]): CivilComponentProps[] {
    return this.getComponentsForIds(this._topNodes, topNodeIds);
  }

  public getAllCorridors(): CivilComponentProps[] {
    return this._corridors;
  }

  public getCorridorsById(corridorIds: string[]): CivilComponentProps[] {
    return this.getComponentsForIds(this._corridors, corridorIds);
  }

  public getCorridorsForTopNodes(topNodeIds: string[]): CivilComponentProps[] {
    return this.getComponentsForComposingIds(this._corridors, topNodeIds);
  }
}
