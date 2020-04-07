import { Guid, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Box, Cone, Point3d, StandardViewIndex, Vector3d, XYZProps } from "@bentley/geometry-core";
import { BackendRequestContext, CategorySelector, DefinitionModel, DisplayStyle3d, IModelDb, ModelSelector, OrthographicViewDefinition, PhysicalModel, PhysicalObject, SpatialCategory, Subject } from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, CodeScopeSpec, ColorDef, GeometricElement3dProps, GeometryStreamBuilder, GeometryStreamProps, IModel, TypeDefinitionElementProps } from "@bentley/imodeljs-common";
import * as path from "path";

const loggerCategory = "sensor-importer";

interface ObservationTypeProps extends TypeDefinitionElementProps {
  unitName: string;
  minValue?: number;
  maxValue?: number;
}

export class SensorImporter {
  private _iModelDb: IModelDb;
  private _physicalModelId!: Id64String;
  private _definitionModelId!: Id64String;
  private _sensorCategoryId!: Id64String;
  private _physicalObjectCategoryId!: Id64String;
  private _sensorTypeCodeSpecId!: Id64String;
  private _observationTypeCodeSpecId!: Id64String;
  private _sensorCodeSpecId!: Id64String;
  private _physicalObjectCodeSpecId!: Id64String;

  public constructor(iModelDb: IModelDb) {
    this._iModelDb = iModelDb;
    if (true) { // initialize logging
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  }

  public async import(): Promise<void> {
    await this.importSchema();
    this.insertCodeSpecs();
    this.insertRepositoryModelHierarchy();
    this.insertSensorCategory();
    this.insertPhysicalObjectCategory();
    this.insertSampleData();
    this.updateProjectExtents();
    this.insertView();
  }

  private async importSchema(): Promise<void> {
    const schemaFileName = path.join(__dirname, "assets", "IoTDevices.ecschema.xml");
    await this._iModelDb.importSchemas(new BackendRequestContext(), [schemaFileName]);
  }

  private insertCodeSpecs(): void {
    this._sensorTypeCodeSpecId = this._iModelDb.codeSpecs.insert("SensorType", CodeScopeSpec.Type.Model);
    this._observationTypeCodeSpecId = this._iModelDb.codeSpecs.insert("ObservationType", CodeScopeSpec.Type.Model);
    this._sensorCodeSpecId = this._iModelDb.codeSpecs.insert("Sensor", CodeScopeSpec.Type.Repository);
    this._physicalObjectCodeSpecId = this._iModelDb.codeSpecs.insert("PhysicalObject", CodeScopeSpec.Type.Repository);
  }

  private insertRepositoryModelHierarchy(): void {
    const subjectId: Id64String = Subject.insert(this._iModelDb, IModel.rootSubjectId, "Sensors");
    this._definitionModelId = DefinitionModel.insert(this._iModelDb, subjectId, "Definitions");
    this._physicalModelId = PhysicalModel.insert(this._iModelDb, subjectId, "Physical");
  }

  private insertSensorCategory(): void {
    this._sensorCategoryId = SpatialCategory.insert(this._iModelDb, this._definitionModelId, "Sensors", { color: ColorDef.from(255, 255, 0) });
  }

  private insertPhysicalObjectCategory(): void {
    this._physicalObjectCategoryId = SpatialCategory.insert(this._iModelDb, this._definitionModelId, "Physical Objects", { color: ColorDef.green });
  }

  private insertSampleData(): void {
    // tunnel physical object
    const tunnelSize = Point3d.create(250, 40, 15);
    const tunnelGeometry: GeometryStreamProps = this.createBox(tunnelSize);
    const southTunnelProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._physicalObjectCategoryId,
      code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: "T1-SB" },
      placement: { origin: [0, 0, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: tunnelGeometry,
    };
    const southTunnelId: Id64String = this._iModelDb.elements.insertElement(southTunnelProps);
    const northTunnelProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._physicalObjectCategoryId,
      code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: "T1-NB" },
      placement: { origin: [0, 60, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: tunnelGeometry,
    };
    const northTunnelId: Id64String = this._iModelDb.elements.insertElement(northTunnelProps);

    // tunnel sensors
    const coId: Id64String = this.insertObservationType("CO", "ppm");
    const no2Id: Id64String = this.insertObservationType("NO2", "ppb");
    const exteriorAirId: Id64String = this.insertSensorType("Baseline Air Sensor", [coId, no2Id]);
    const interiorAirId: Id64String = this.insertSensorType("Tunnel Air Sensor", [coId, no2Id]);
    const tempId: Id64String = this.insertObservationType("Temperature", "degrees Celsius");
    const exteriorTempId: Id64String = this.insertSensorType("Exterior Thermometer", [tempId]);
    const interiorTempId: Id64String = this.insertSensorType("Interior Thermometer", [tempId]);
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

    /*
    3 sets of 2 bridges (1 each does both deflection/vibration in the middle)

    1 NB/1SB - vehicle/truck count avg per/hour
    */

    // road physical object
    const roadSize = Point3d.create(500, 40, 0.1);
    const roadGeometry: GeometryStreamProps = this.createBox(roadSize);
    const southRoadProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._physicalObjectCategoryId,
      code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: "SB-R1" },
      placement: { origin: [tunnelSize.x, 0, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: roadGeometry,
    };
    const southRoadId: Id64String = this._iModelDb.elements.insertElement(southRoadProps);
    const northRoadProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._physicalObjectCategoryId,
      code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: "NB-R1" },
      placement: { origin: [tunnelSize.x, 60, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: roadGeometry,
    };
    const northRoadId: Id64String = this._iModelDb.elements.insertElement(northRoadProps);

    // road sensors
    const vehicleCountId: Id64String = this.insertObservationType("Vehicle Count", "average per hour");
    const truckCountId: Id64String = this.insertObservationType("Truck Count", "average per hour");
    const vehicleCounterId: Id64String = this.insertSensorType("Vehicle Counter", [vehicleCountId, truckCountId]);
    this.insertSensor(vehicleCounterId, "SB-R1-VC1", [tunnelSize.x + roadSize.x / 2.0, roadSize.y, 0.1], southRoadId);
    this.insertSensor(vehicleCounterId, "NB-R1-VC1", [tunnelSize.x + roadSize.x / 2.0, 60, 0.1], northRoadId);

    // bridge physical object
    const bridgeSize = Point3d.create(250, 50, 0.1);
    const bridgeGeometry: GeometryStreamProps = this.createBox(bridgeSize);
    const southBridgeProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._physicalObjectCategoryId,
      code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: "SB-BR1" },
      placement: { origin: [tunnelSize.x + roadSize.x, (roadSize.y - bridgeSize.y) / 2.0, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createBox(bridgeSize),
    };
    const southBridgeId: Id64String = this._iModelDb.elements.insertElement(southBridgeProps);
    const northBridgeProps: GeometricElement3dProps = {
      classFullName: PhysicalObject.classFullName,
      model: this._physicalModelId,
      category: this._physicalObjectCategoryId,
      code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: "NB-BR1" },
      placement: { origin: [tunnelSize.x + roadSize.x, (roadSize.y - bridgeSize.y) / 2.0 + 60, 0], angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createBox(bridgeSize),
    };
    const northBridgeId: Id64String = this._iModelDb.elements.insertElement(northBridgeProps);

    // bridge sensors
    const deflectionId: Id64String = this.insertObservationType("Deflection", "mm");
    const vibrationId: Id64String = this.insertObservationType("Vibration Amplitude", "g");
    const bridgeSensorTypeId: Id64String = this.insertSensorType("Bridge Sensor", [deflectionId, vibrationId]);
    this.insertSensor(bridgeSensorTypeId, "SB-BR1-BS-1", [tunnelSize.x + roadSize.x + bridgeSize.x / 2.0, (roadSize.y - bridgeSize.y) / 2.0, 0.1], southBridgeId);
    this.insertSensor(bridgeSensorTypeId, "NB-BR1-BS-1", [tunnelSize.x + roadSize.x + bridgeSize.x / 2.0, (roadSize.y - bridgeSize.y) / 2.0 + bridgeSize.y + 60, 0.1], northBridgeId);
  }

  private insertSensorType(name: string, observationTypes: Id64String[]): Id64String {
    const sensorTypeProps: TypeDefinitionElementProps = {
      classFullName: "IoTDevices:SensorType",
      model: this._definitionModelId,
      code: { spec: this._sensorTypeCodeSpecId, scope: this._definitionModelId, value: name },
    };
    const sensorTypeId: Id64String = this._iModelDb.elements.insertElement(sensorTypeProps);
    observationTypes.forEach((observationTypeId: Id64String) => {
      this._iModelDb.relationships.insertInstance({
        classFullName: "IoTDevices:SensorTypeHasObservationTypes",
        sourceId: sensorTypeId,
        targetId: observationTypeId,
      });
    });
    return sensorTypeId;
  }

  private insertObservationType(codeValue: string, unitName: string, minValue?: number, maxValue?: number): Id64String {
    const observationTypeProps: ObservationTypeProps = {
      classFullName: "IoTDevices:ObservationType",
      model: this._definitionModelId,
      code: { spec: this._observationTypeCodeSpecId, scope: this._definitionModelId, value: codeValue },
      unitName,
      minValue,
      maxValue,
    };
    return this._iModelDb.elements.insertElement(observationTypeProps);
  }

  private insertSensor(typeDefinitionId: Id64String, name: string, origin: XYZProps, physicalObjectId: Id64String): Id64String {
    const sensorProps: GeometricElement3dProps = {
      classFullName: "IoTDevices:Sensor",
      model: this._physicalModelId,
      category: this._sensorCategoryId,
      federationGuid: Guid.createValue(),
      code: { spec: this._sensorCodeSpecId, scope: IModel.rootSubjectId, value: name },
      typeDefinition: { id: typeDefinitionId },
      placement: { origin, angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createSensorGeometry(0.2),
    };
    const sensorId: Id64String = this._iModelDb.elements.insertElement(sensorProps);
    if (undefined !== physicalObjectId) {
      this._iModelDb.relationships.insertInstance({
        classFullName: "IoTDevices:SensorObservesSpatialElement",
        sourceId: sensorId,
        targetId: physicalObjectId,
      });
    }
    return sensorId;
  }

  private createSensorGeometry(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(cylinder);
    return geometryStreamBuilder.geometryStream;
  }

  private createBox(size: Point3d): GeometryStreamProps {
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(Box.createDgnBox(Point3d.createZero(), Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, size.z), size.x, size.y, size.x, size.y, true)!);
    return geometryStreamBuilder.geometryStream;
  }

  private insertView(): Id64String {
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const viewExtents: AxisAlignedBox3d = physicalModel.queryExtents();
    const modelSelectorId = ModelSelector.insert(this._iModelDb, this._definitionModelId, "Sensor Models", [this._physicalModelId]);
    const categorySelectorId = CategorySelector.insert(this._iModelDb, this._definitionModelId, "Sensor Categories", [this._sensorCategoryId, this._physicalObjectCategoryId]);
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
