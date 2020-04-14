/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { Point3d } from "@bentley/geometry-core";

export interface ClassMapQueryRow {
  name: string;
  id: string;
}

export interface CompositionItemQueryRow {
  classId: string;
  instanceId: string;
  code: string;
  classification: string;
  parentId: string;
  geometricId: string;
  geometricCode: string;
}

export interface SensorQueryRow {
  id: string;
  position: Point3d;
  code: string;
  typeCode: string;
  observedId: string;
}

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

  public async queryAllTunnels() {
    const query = `SELECT e.ecinstanceid, e.userlabel
    FROM BisCore.GeometricElement3d e, DgnV8OpenRoadsDesigner.FeatureAspect f
    WHERE e.ECInstanceId = f.Element.Id AND (Name = 'TC_Ret Wall-Cut_L' OR Name = 'TC_Ret Wall-Cut_R')`;
    const rows = await this.executeQuery(query);

    return rows;
  }

  public async queryRoadNetworkCompositionClasses(): Promise<ClassMapQueryRow[]> {
    const query = `SELECT c.ecinstanceId, c.name
    FROM meta.ECClassDef c, meta.ECSchemaDef s
    WHERE c.schema.id = s.ecinstanceId AND s.name = 'RoadNetworkComposition'`;
    const rows = await this.executeQuery(query);

    return rows as ClassMapQueryRow[];
  }

  public async queryAllCompositionItems(): Promise<CompositionItemQueryRow[]> {
    const query = `
    SELECT c.ECClassId classId, c.ECInstanceId instanceId, c.CodeValue code, c.Classification classification, c.parent.id parentId, g.ECInstanceId geometricId, g.CodeValue geometricCode
    FROM RoadNetworkComposition.CompositionItem c
    LEFT JOIN BisCore.ElementGroupsMembers r ON c.ECInstanceId=r.SourceECInstanceId
    LEFT JOIN BisCore.GeometricElement3d g ON g.ECInstanceId=r.TargetECInstanceId`;
    const rows = await this.executeQuery(query);

    return rows as CompositionItemQueryRow[];
  }

  public async queryAllSensors(): Promise<SensorQueryRow[]> {
    const query = `
    SELECT s.EcInstanceId id, s.Origin position, s.CodeValue code, t.ECInstanceId typeId, t.CodeValue typeCode, c.ECInstanceId observedId, c.CodeValue observedCode
    FROM iot:Sensor s,iot:SensorType t,rnc:CompositionItem c,iot:SensorObservesElement o
    WHERE s.typeDefinition.id=t.ECInstanceId AND s.ECInstanceId=o.SourceECInstanceId AND c.ECInstanceId=o.TargetECInstanceId`;
    const rows = await this.executeQuery(query);

    return rows as SensorQueryRow[];
  }

}
