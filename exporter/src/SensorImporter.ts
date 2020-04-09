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
