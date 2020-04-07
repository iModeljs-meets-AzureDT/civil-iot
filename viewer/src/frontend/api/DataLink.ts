/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@bentley/imodeljs-frontend";

export class DataLink {

  private _iModel: IModelConnection;

  constructor(iModel: IModelConnection) {
    this._iModel = iModel;
  }

  private async executeQuery(query: string) {

    const rows = [];
    for await (const row of this._iModel.query(query)) rows.push(row);
    return rows;
  }

  public async queryAllBridgeAlignments() {
    const query = `SELECT alg.StartValue, alg.LengthValue, alg.StartStation
    FROM RoadRailAlignment.Alignment alg, LinearReferencing.ILinearlyLocatedAlongILinearElement le, BridgeStructuralPhysical.Bridge b
    WHERE b.ECInstanceId = le.SourceECInstanceId AND le.TargetECInstanceId = alg.ECInstanceId`;
    const rows = await this.executeQuery(query);

    return rows;
  }

  public async queryAllTransportationNetworks() {
    const query = `SELECT ECInstanceId, CodeValue FROM RoadRailPhysical.TransportationNetwork`;
    const rows = await this.executeQuery(query);

    return rows;
  }

  public async queryAllCorridorForTransportationNetwork(networkId: string) {
    const query = `SELECT corridor.ECInstanceId, corridor.CodeValue
    FROM Bis.ModelContainsElements link JOIN RoadRailPhysical.Corridor corridor ON link.TargetECInstanceId = corridor.ECInstanceId
    WHERE link.SourceECInstanceId = ` + networkId;
    const rows = await this.executeQuery(query);

    return rows;
  }

  public async queryAllTransportationSystemsForCorridor(corridorId: string) {
    const query = `SELECT system.ECInstanceId, system.CodeValue
    FROM Bis.ModelContainsElements link JOIN RoadRailPhysical.TransportationSystem system ON link.TargetECInstanceId = system.ECInstanceId
    WHERE link.SourceECInstanceId = ` + corridorId;
    const rows = await this.executeQuery(query);

    return rows;
  }

  public async queryAllRoadwaysForTransportationSystems(systemId: string) {
    const query = `SELECT roadway.ECInstanceId, roadway.CodeValue
    FROM Bis.ModelContainsElements link JOIN RoadPhysical.Roadway roadway ON link.TargetECInstanceId = roadway.ECInstanceId
    WHERE link.SourceECInstanceId = ` + systemId;
    const rows = await this.executeQuery(query);

    return rows;
  }

  public async querySubModelContentsForModeledElement(modeledId: string) {
    const query = `SELECT content.ECClassId, content.ECInstanceId, content.CodeValue
    FROM Bis.ModelContainsElements link JOIN Bis.PhysicalElement content ON link.TargetECInstanceId = content.ECInstanceId
    WHERE link.SourceECInstanceId = ` + modeledId;
    const rows = await this.executeQuery(query);

    return rows;
  }

}