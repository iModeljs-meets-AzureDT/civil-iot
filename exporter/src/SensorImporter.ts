import { GuidString, Id64String, Logger, LogLevel, Id64, IModelStatus } from "@bentley/bentleyjs-core";
import { Box, Cone, Point3d, StandardViewIndex, Vector3d, XYZProps, XYAndZ } from "@bentley/geometry-core";
import { BackendRequestContext, CategorySelector, DefinitionModel, DisplayStyle3d, IModelDb, ModelSelector, OrthographicViewDefinition, PhysicalModel, PhysicalObject, SpatialCategory, Subject, IModelJsFs, SpatialLocation } from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, CodeScopeSpec, ColorDef, GeometricElement3dProps, GeometryStreamBuilder, GeometryStreamProps, IModel, TypeDefinitionElementProps, Code, IModelError, Placement3dProps } from "@bentley/imodeljs-common";
import * as path from "path";
import { ObservationTypeProps } from "./IoTDevices";

const loggerCategory = "sensor-importer";

export class SensorImporter {
  private _iModelDb: IModelDb;
  private _physicalModelId!: Id64String;
  private _definitionModelId!: Id64String;
  private _sensorCategoryId!: Id64String;
  private _spatialLocationCategoryId!: Id64String;
  private _sensorTypeCodeSpecId!: Id64String;
  private _observationTypeCodeSpecId!: Id64String;
  private _sensorCodeSpecId!: Id64String;
  private _spatialLocationCodeSpecId!: Id64String;

  public constructor(iModelDb: IModelDb) {
    this._iModelDb = iModelDb;
    if (true) { // initialize logging
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  }

  public async import(schemaFiles: string[], inputDataFile: string): Promise<void> {
    await this.importSchema(schemaFiles);
    this.insertCodeSpecs();
    this.insertRepositoryModelHierarchy();
    this.insertCategories();
    this.insertData(inputDataFile);
    // this.insertSampleData();
    this.updateProjectExtents();
    this.insertView();
  }

  private async importSchema(schemaFiles: string[]): Promise<void> {
    await this._iModelDb.importSchemas(new BackendRequestContext(), schemaFiles);
  }

  private insertCodeSpecs(): void {
    this._sensorTypeCodeSpecId = this._iModelDb.codeSpecs.insert("SensorType", CodeScopeSpec.Type.Model);
    this._observationTypeCodeSpecId = this._iModelDb.codeSpecs.insert("ObservationType", CodeScopeSpec.Type.Model);
    this._sensorCodeSpecId = this._iModelDb.codeSpecs.insert("Sensor", CodeScopeSpec.Type.Repository);
    this._spatialLocationCodeSpecId = this._iModelDb.codeSpecs.insert("PhysicalObject", CodeScopeSpec.Type.Repository);
  }

  private insertRepositoryModelHierarchy(): void {
    const subjectId: Id64String = Subject.insert(this._iModelDb, IModel.rootSubjectId, "Sensors");
    this._definitionModelId = DefinitionModel.insert(this._iModelDb, subjectId, "Definitions");
    this._physicalModelId = PhysicalModel.insert(this._iModelDb, subjectId, "Physical");
  }

  private insertCategories(): void {
    this._spatialLocationCategoryId = SpatialCategory.insert(this._iModelDb, this._definitionModelId, "Spatial Locations", { color: ColorDef.green });
    this._sensorCategoryId = SpatialCategory.insert(this._iModelDb, this._definitionModelId, "Sensors", { color: ColorDef.from(255, 255, 0) });
  }

  private insertData(inputDataFile: string): void {
    const inputData = JSON.parse(IModelJsFs.readFileSync(inputDataFile) as string);
    if (inputData.observationTypes) {
      inputData.observationTypes.forEach((observationTypeData: any) => {
        this.insertObservationType(observationTypeData.name, observationTypeData.unit);
      });
    }
    if (inputData.sensorTypes) {
      inputData.sensorTypes.forEach((sensorTypeData: any) => {
        this.insertSensorType(sensorTypeData.name, sensorTypeData.federationGuid, sensorTypeData.observationTypes);
      });
    }
    if (inputData.spatialLocations) {
      inputData.spatialLocations.forEach((spatialLocationData: any) => {
        this.insertSpatialLocation(spatialLocationData.name, spatialLocationData.size, spatialLocationData.placement);
      });
    }
    if (inputData.sensors) {
      inputData.sensors.forEach((sensorData: any) => {
        this.insertSensor(sensorData.type, sensorData.name, sensorData.origin, sensorData.observes);
      });
    }
  }

  private insertSpatialLocation(name: string, size: XYZProps, placement: Placement3dProps): Id64String {
    const boxGeometry: GeometryStreamProps = this.createBox(size);
    const elementProps: GeometricElement3dProps = {
      classFullName: SpatialLocation.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: name },
      placement,
      geom: boxGeometry,
    };
    return this._iModelDb.elements.insertElement(elementProps);
  }

  private insertSampleData(): void {
    // tunnel physical object
    const tunnelSize = Point3d.create(250, 40, 15);
    const tunnelGeometry: GeometryStreamProps = this.createBox(tunnelSize);
    const southTunnelProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: "T1-SB" },
      placement: { origin: [0, 0, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: tunnelGeometry,
    };
    const southTunnelId: Id64String = this._iModelDb.elements.insertElement(southTunnelProps);
    const northTunnelProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: "T1-NB" },
      placement: { origin: [0, 60, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: tunnelGeometry,
    };
    const northTunnelId: Id64String = this._iModelDb.elements.insertElement(northTunnelProps);

    // tunnel sensors
    const coId: Id64String = this.insertObservationType("CO", "ppm");
    const no2Id: Id64String = this.insertObservationType("NO2", "ppb");
    const exteriorAirId: Id64String = this.insertSensorType("Baseline Air Sensor", "2b91d7d0-9fd3-4f8b-9af3-2a400b7caee5", [coId, no2Id]);
    const interiorAirId: Id64String = this.insertSensorType("Tunnel Air Sensor", "b92a49e4-f653-4e35-9c81-280d8efea5e9", [coId, no2Id]);
    const tempId: Id64String = this.insertObservationType("Temperature", "degrees Celsius");
    const exteriorTempId: Id64String = this.insertSensorType("Exterior Thermometer", "ea174023-ee9e-480c-a70e-faf308d1241f", [tempId]);
    const interiorTempId: Id64String = this.insertSensorType("Interior Thermometer", "a1e8a9e4-27a6-4bb3-981f-61173c06a935", [tempId]);
    this.insertSensor(interiorAirId, "T1-SB-INT-AIR-1", [tunnelSize.x / 3.0, 0, 10], southTunnelId);
    this.insertSensor(interiorAirId, "T1-SB-INT-AIR-2", [2 * tunnelSize.x / 3.0, 0, 10], southTunnelId);
    this.insertSensor(interiorTempId, "T1-SB-INT-TEMP-1", [tunnelSize.x / 3.0, tunnelSize.y, 10], southTunnelId);
    this.insertSensor(interiorTempId, "T1-SB-INT-TEMP-2", [2 * tunnelSize.x / 3.0, tunnelSize.y, 10], southTunnelId);
    this.insertSensor(exteriorAirId, "T1-SB-EXT-AIR-1", [0, tunnelSize.y / 3.0, tunnelSize.z], southTunnelId);
    this.insertSensor(exteriorTempId, "T1-SB-EXT-TEMP-1", [0, 2 * tunnelSize.y / 3.0, tunnelSize.z], southTunnelId);
    this.insertSensor(interiorAirId, "T1-NB-INT-AIR-1", [tunnelSize.x / 3.0, 60, 10], northTunnelId);
    this.insertSensor(interiorAirId, "T1-NB-INT-AIR-2", [2 * tunnelSize.x / 3.0, 60, 10], northTunnelId);
    this.insertSensor(interiorTempId, "T1-NB-INT-TEMP-1", [tunnelSize.x / 3.0, 60 + tunnelSize.y, 10], northTunnelId);
    this.insertSensor(interiorTempId, "T1-NB-INT-TEMP-2", [2 * tunnelSize.x / 3.0, 60 + tunnelSize.y, 10], northTunnelId);
    this.insertSensor(exteriorAirId, "T1-NB-EXT-AIR-1", [tunnelSize.x, 60 + tunnelSize.y / 3.0, tunnelSize.z], northTunnelId);
    this.insertSensor(exteriorTempId, "T1-NB-EXT-TEMP-1", [tunnelSize.x, 60 + 2 * tunnelSize.y / 3.0, tunnelSize.z], northTunnelId);
    // These observations roll up into the computed "Tunnel Air Quality" metric in ADT

    // road physical object
    const roadSize = Point3d.create(500, 40, 0.1);
    const roadGeometry: GeometryStreamProps = this.createBox(roadSize);
    const southRoadProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: "R1-SB" },
      placement: { origin: [tunnelSize.x, 0, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: roadGeometry,
    };
    const southRoadId: Id64String = this._iModelDb.elements.insertElement(southRoadProps);
    const northRoadProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: "R1-NB" },
      placement: { origin: [tunnelSize.x, 60, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: roadGeometry,
    };
    const northRoadId: Id64String = this._iModelDb.elements.insertElement(northRoadProps);

    // road sensors
    const vehicleCountId: Id64String = this.insertObservationType("Vehicle Count", "average per hour");
    const truckCountId: Id64String = this.insertObservationType("Truck Count", "average per hour");
    const vehicleCounterId: Id64String = this.insertSensorType("Vehicle Counter", "dd143ee4-9f0d-4ebc-b844-1f335647dd86", [vehicleCountId, truckCountId]);
    this.insertSensor(vehicleCounterId, "R1-SB-VC1", [tunnelSize.x + roadSize.x / 2.0, roadSize.y, 0.1], southRoadId);
    this.insertSensor(vehicleCounterId, "R1-NB-VC1", [tunnelSize.x + roadSize.x / 2.0, 60, 0.1], northRoadId);
    // These observations roll up into the computed "Traffic Flow" metric in ADT

    // bridge physical object
    const bridgeSize = Point3d.create(250, 50, 0.1);
    const bridgeGeometry: GeometryStreamProps = this.createBox(bridgeSize);
    const southBridgeProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: "BR1-SB" },
      placement: { origin: [tunnelSize.x + roadSize.x, (roadSize.y - bridgeSize.y) / 2.0, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: bridgeGeometry,
    };
    const southBridgeId: Id64String = this._iModelDb.elements.insertElement(southBridgeProps);
    const northBridgeProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._spatialLocationCategoryId,
      code: { spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: "BR1-NB" },
      placement: { origin: [tunnelSize.x + roadSize.x, (roadSize.y - bridgeSize.y) / 2.0 + 60, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: bridgeGeometry,
    };
    const northBridgeId: Id64String = this._iModelDb.elements.insertElement(northBridgeProps);

    // bridge sensors
    const deflectionId: Id64String = this.insertObservationType("Deflection", "mm");
    const vibrationId: Id64String = this.insertObservationType("Vibration Amplitude", "g");
    const bridgeSensorTypeId: Id64String = this.insertSensorType("Bridge Sensor", "9adddb0e-1b6b-4399-92c8-b6322a57d028", [deflectionId, vibrationId]);
    this.insertSensor(bridgeSensorTypeId, "BR1-SB-BS-1", [tunnelSize.x + roadSize.x + bridgeSize.x / 2.0, (roadSize.y - bridgeSize.y) / 2.0, 0.1], southBridgeId);
    this.insertSensor(bridgeSensorTypeId, "BR1-NB-BS-1", [tunnelSize.x + roadSize.x + bridgeSize.x / 2.0, (roadSize.y - bridgeSize.y) / 2.0 + bridgeSize.y + 60, 0.1], northBridgeId);
    // These observations roll up into the computed "Bridge Safety" metric in ADT
  }

  private insertSensorType(name: string, federationGuid: GuidString, observationTypeIdsOrCodes: Id64String[] | string[]): Id64String {
    const sensorTypeProps: TypeDefinitionElementProps = {
      classFullName: "IoTDevices:SensorType",
      model: this._definitionModelId,
      code: { spec: this._sensorTypeCodeSpecId, scope: this._definitionModelId, value: name },
      federationGuid,
    };
    const sensorTypeId: Id64String = this._iModelDb.elements.insertElement(sensorTypeProps);
    observationTypeIdsOrCodes.forEach((idOrCode: Id64String | string) => {
      const observationTypeId: Id64String = Id64.isValidId64(idOrCode) ? idOrCode : this.queryObservationTypeByCode(idOrCode);
      this._iModelDb.relationships.insertInstance({
        classFullName: "IoTDevices:SensorTypeHasObservationTypes",
        sourceId: sensorTypeId,
        targetId: observationTypeId,
      });
    });
    return sensorTypeId;
  }

  private insertObservationType(codeValue: string, unit: string, minValue?: number, maxValue?: number): Id64String {
    const observationTypeProps: ObservationTypeProps = {
      classFullName: "IoTDevices:ObservationType",
      model: this._definitionModelId,
      code: { spec: this._observationTypeCodeSpecId, scope: this._definitionModelId, value: codeValue },
      unit,
      minValue,
      maxValue,
    };
    return this._iModelDb.elements.insertElement(observationTypeProps);
  }

  private queryObservationTypeByCode(codeValue: string): Id64String {
    const observationTypeId: Id64String | undefined = this._iModelDb.elements.queryElementIdByCode(new Code({
      spec: this._observationTypeCodeSpecId,
      scope: this._definitionModelId,
      value: codeValue,
    }));
    if (undefined === observationTypeId) {
      throw new IModelError(IModelStatus.NotFound, `ObservationType "${codeValue}" not found.`);
    }
    return observationTypeId;
  }

  private insertSensor(sensorTypeId: Id64String, name: string, origin: XYZProps, physicalObjectIdOrCode: Id64String | string): Id64String {
    const sensorTypeIndex: number = this.getNextSensorTypeIndex(sensorTypeId);
    const sensorProps: GeometricElement3dProps = {
      classFullName: "IoTDevices:Sensor",
      model: this._physicalModelId,
      category: this._sensorCategoryId,
      code: { spec: this._sensorCodeSpecId, scope: IModel.rootSubjectId, value: name },
      typeDefinition: { id: sensorTypeId },
      placement: { origin, angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createSensorGeometry(0.2),
      jsonProperties: { iot: { sensorTypeIndex } },
    };
    const sensorId: Id64String = this._iModelDb.elements.insertElement(sensorProps);
    const physicalObjectId = Id64.isValidId64(physicalObjectIdOrCode) ? physicalObjectIdOrCode : this.tryQueryPhysicalObjectByCode(physicalObjectIdOrCode);
    if (undefined !== physicalObjectId) {
      this._iModelDb.relationships.insertInstance({
        classFullName: "IoTDevices:SensorObservesSpatialElement",
        sourceId: sensorId,
        targetId: physicalObjectId,
      });
    }
    return sensorId;
  }

  private tryQueryPhysicalObjectByCode(codeValue: string): Id64String | undefined {
    return this._iModelDb.elements.queryElementIdByCode(new Code({ spec: this._spatialLocationCodeSpecId, scope: IModel.rootSubjectId, value: codeValue }));
  }

  private _sensorTypeIndexMap = new Map<Id64String, number>();
  private getNextSensorTypeIndex(sensorTypeId: Id64String): number {
    let sensorTypeIndex: number | undefined = this._sensorTypeIndexMap.get(sensorTypeId);
    if (undefined === sensorTypeIndex) {
      sensorTypeIndex = 0;
    }
    this._sensorTypeIndexMap.set(sensorTypeId, ++sensorTypeIndex);
    return sensorTypeIndex;
  }

  private createSensorGeometry(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(cylinder);
    return geometryStreamBuilder.geometryStream;
  }

  private createBox(xyzProps: XYZProps): GeometryStreamProps {
    const size = Point3d.fromJSON(xyzProps);
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(Box.createDgnBox(Point3d.createZero(), Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, size.z), size.x, size.y, size.x, size.y, true)!);
    return geometryStreamBuilder.geometryStream;
  }

  private insertView(): Id64String {
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const viewExtents: AxisAlignedBox3d = physicalModel.queryExtents();
    const modelSelectorId = ModelSelector.insert(this._iModelDb, this._definitionModelId, "Sensor Models", [this._physicalModelId]);
    const categorySelectorId = CategorySelector.insert(this._iModelDb, this._definitionModelId, "Sensor Categories", [this._sensorCategoryId, this._spatialLocationCategoryId]);
    const displayStyleId = DisplayStyle3d.insert(this._iModelDb, this._definitionModelId, "Display Style");
    const viewId = OrthographicViewDefinition.insert(this._iModelDb, this._definitionModelId, "Sensor View", modelSelectorId, categorySelectorId, displayStyleId, viewExtents, StandardViewIndex.Iso);
    this._iModelDb.views.setDefaultViewId(viewId);
    return viewId;
  }

  private updateProjectExtents(): void {
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const extents: AxisAlignedBox3d = physicalModel.queryExtents();
    extents.expandInPlace(10);
    this._iModelDb.updateProjectExtents(extents);
  }
}
