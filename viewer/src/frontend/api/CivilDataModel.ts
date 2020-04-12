/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { DataLink, ClassMapQueryRow, CompositionItemQueryRow, SensorQueryRow } from "./DataLink";

export enum CivilDataComponentType {
  Interstate, Highway, LocalRoad, Roadway, Bridge, Tunnel, RoadSegment, Ramp, GenericSensor, AirQualitySensor, TemperatureSensor, VibrationSensor, TrafficSensor,
}

export interface CivilComponentProps {
  id: string;                           // Id of this component
  label: string;                        // UI label for this component
  composingId: string;                  // Id of the 'parent' component for the UI tree
  type: CivilDataComponentType;         // for icons, etc.
  geometricId?: string;                 // element with geometry for this component
}

export class CivilDataModel {
  private _allComponents: CivilComponentProps[];
  private _allSensors: CivilComponentProps[];

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
    this._allComponents = [];
    this._allSensors = [];
  }

  private getClassNameFromId(classMap: ClassMapQueryRow[], classId: string) {
    const nameMapper = classMap.find((e: ClassMapQueryRow) => (e.id === classId));
    return nameMapper ? nameMapper.name : "";
  }

  private getComponentTypeForQueryRow(row: CompositionItemQueryRow, classes: ClassMapQueryRow[]): CivilDataComponentType {
    const className = this.getClassNameFromId(classes, row.classId);

    switch (className) {
      case "RoadNetwork":
        if ("National" === row.classification)
          return CivilDataComponentType.Interstate;
        else if ("State" === row.classification)
          return CivilDataComponentType.Highway;
        else
          return CivilDataComponentType.LocalRoad;
      case "Roadway":
        return CivilDataComponentType.Roadway;
      case "Bridge":
        return CivilDataComponentType.Bridge;
      case "Tunnel":
        return CivilDataComponentType.Tunnel;
      case "RoadSegment":
        return CivilDataComponentType.RoadSegment;
    }

    return CivilDataComponentType.Interstate;
  }

  private getSensorTypeForQueryRow(row: SensorQueryRow): CivilDataComponentType {
    switch (row.typeCode) {
      default:
      case "Tunnel Air Sensor":
      case "Baseline Air Sensor":
        return CivilDataComponentType.AirQualitySensor;
      case "Interior Thermometer":
      case "Exterior Thermometer":
        return CivilDataComponentType.TemperatureSensor;
      case "Bridge Sensor":
        return CivilDataComponentType.VibrationSensor;
      case "Vehicle Counter":
        return CivilDataComponentType.TrafficSensor;
    }
  }

  private async populateCompositionItems(dataLink: DataLink) {
    const classes = await dataLink.queryRoadNetworkCompositionClasses();

    const rows = await dataLink.queryAllCompositionItems();
    rows.forEach((row) => {
      const type = this.getComponentTypeForQueryRow(row, classes);
      const composingId = (undefined !== row.parentId) ? row.parentId : "";
      this._allComponents.push({ type, id: row.instanceId, label: row.code, composingId, geometricId: row.geometricId });
    });
  }

  private async populateSensors(dataLink: DataLink) {
    const rows = await dataLink.queryAllSensors();
    rows.forEach((row) => {
      const type = this.getSensorTypeForQueryRow(row);
      this._allSensors.push({ type, id: row.id, label: row.code, composingId: "" });
    });
  }

  public async load(imodel: IModelConnection) {
    const dataLink = new DataLink(imodel);

    this.populateCompositionItems(dataLink);
    this.populateSensors(dataLink);
  }

  public static getIconForComponent(type: CivilDataComponentType) {
    switch (type) {
      case CivilDataComponentType.Interstate: return "Road_36.png";
      case CivilDataComponentType.Highway: return "road-split.svg";
      case CivilDataComponentType.LocalRoad: return "Intersection_36.png";
      case CivilDataComponentType.Bridge: return "Bridge_2_36.png";
      case CivilDataComponentType.Tunnel: return "Tunnel_36.png";
      case CivilDataComponentType.Roadway: return "road-template.svg";
      case CivilDataComponentType.RoadSegment: return "road-template.svg";
      case CivilDataComponentType.Ramp: return "road_36.png";
      case CivilDataComponentType.GenericSensor: return "dashboard_2.svg";
      case CivilDataComponentType.AirQualitySensor: return "air-quality-sensor.png";
      case CivilDataComponentType.TemperatureSensor: return "temperature-sensor.png";
      case CivilDataComponentType.VibrationSensor: return "activity.SVG";
      case CivilDataComponentType.TrafficSensor: return "dashboard_2.svg";
    }

    return "";
  }

  public getAllComponents(): CivilComponentProps[] {
    return this._allComponents;
  }

  public getComponentsForParent(parentId: string): CivilComponentProps[] {
    return this._allComponents.filter((c: CivilComponentProps) => c.composingId === parentId);
  }

  public getChildCount(id: string): number {
    return this.getComponentsForParent(id).length;
  }

  public getAllSensors(): CivilComponentProps[] {
    return this._allSensors;
  }

  public getComponentsForTypes(types: CivilDataComponentType[]): CivilComponentProps[] {
    return this._allComponents.filter((c: CivilComponentProps) => -1 !== types.indexOf(c.type));
  }

  public getSensorsForTypes(types: CivilDataComponentType[]): CivilComponentProps[] {
    return this._allSensors.filter((c: CivilComponentProps) => -1 !== types.indexOf(c.type));
  }
}