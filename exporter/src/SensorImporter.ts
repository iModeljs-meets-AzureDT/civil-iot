import { Guid, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Cone, XYZProps, Point3d, Vector3d, StandardViewIndex } from "@bentley/geometry-core";
import { BackendRequestContext, DefinitionModel, IModelDb, PhysicalModel, SpatialCategory, Subject, ModelSelector, CategorySelector, DisplayStyle3d, OrthographicViewDefinition } from "@bentley/imodeljs-backend";
import { CodeScopeSpec, ColorDef, GeometricElement3dProps, IModel, TypeDefinitionElementProps, GeometryStreamProps, GeometryStreamBuilder, AxisAlignedBox3d } from "@bentley/imodeljs-common";
import * as path from "path";

const loggerCategory = "sensor-importer";

interface ObservationTypeProps extends TypeDefinitionElementProps {
  unitName: string;
  minValue: number;
  maxValue: number;
}

export class SensorImporter {
  private _iModelDb: IModelDb;
  private _physicalModelId!: Id64String;
  private _definitionModelId!: Id64String;
  private _sensorCategoryId!: Id64String;
  private _sensorTypeCodeSpecId!: Id64String;
  private _observationTypeCodeSpecId!: Id64String;
  private _sensorCodeSpecId!: Id64String;

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
    this.insertSampleData();
  }

  private async importSchema(): Promise<void> {
    const schemaFileName = path.join(__dirname, "assets", "IoTDevices.ecschema.xml");
    await this._iModelDb.importSchemas(new BackendRequestContext(), [schemaFileName]);
  }

  private insertCodeSpecs(): void {
    this._sensorTypeCodeSpecId = this._iModelDb.codeSpecs.insert("SensorType", CodeScopeSpec.Type.Model);
    this._observationTypeCodeSpecId = this._iModelDb.codeSpecs.insert("ObservationType", CodeScopeSpec.Type.Model);
    this._sensorCodeSpecId = this._iModelDb.codeSpecs.insert("Sensor", CodeScopeSpec.Type.Repository);
  }

  private insertRepositoryModelHierarchy(): void {
    const subjectId: Id64String = Subject.insert(this._iModelDb, IModel.rootSubjectId, "Sensors");
    this._definitionModelId = DefinitionModel.insert(this._iModelDb, subjectId, "Definitions");
    this._physicalModelId = PhysicalModel.insert(this._iModelDb, subjectId, "Physical");
  }

  private insertSensorCategory(): void {
    this._sensorCategoryId = SpatialCategory.insert(this._iModelDb, this._definitionModelId, "Sensors", { color: ColorDef.blue });
  }

  private insertSampleData(): void {
    const sensorTypeAQ: Id64String = this.insertSensorType("Air Quality");
    this.insertObservationType(sensorTypeAQ, "CO", "ppm", 0.0, 100.0);
    this.insertObservationType(sensorTypeAQ, "NO", "ppm", 0.0, 100.0);
    this.insertObservationType(sensorTypeAQ, "NO2", "ppm", 0.0, 100.0);
    this.insertSensor(sensorTypeAQ, "AQ-1", [1, 1, 0]);
    this.insertSensor(sensorTypeAQ, "AQ-2", [2, 2, 0]);

    const sensorTypeBD: Id64String = this.insertSensorType("Bridge Deflection");
    this.insertObservationType(sensorTypeBD, "Deflection", "m", 0.0, 1.0);
    this.insertSensor(sensorTypeBD, "BD-1", [-1, -1, 0]);
    this.insertSensor(sensorTypeBD, "BD-2", [-2, -2, 0]);

    const sensorTypeBV: Id64String = this.insertSensorType("Bridge Vibration");
    this.insertObservationType(sensorTypeBV, "Vibration", "hz", 0.0, 0.1);
    this.insertSensor(sensorTypeBV, "BV-1", [-1, -2, 0]);
    this.insertSensor(sensorTypeBV, "BV-2", [-2, -3, 0]);

    const sensorTypeT: Id64String = this.insertSensorType("Traffic");
    this.insertObservationType(sensorTypeT, "Vehicle Count", "count", 0, Number.MAX_SAFE_INTEGER);
    this.insertObservationType(sensorTypeT, "Truck Count", "count", 0, Number.MAX_SAFE_INTEGER);
    this.insertSensor(sensorTypeBV, "T-1", [1, 2, 0]);
    this.insertSensor(sensorTypeBV, "T-2", [2, 3, 0]);

    this.insertView();
  }

  private insertSensorType(name: string): Id64String {
    const sensorTypeProps: TypeDefinitionElementProps = {
      classFullName: "IoTDevices:SensorType",
      model: this._definitionModelId,
      code: { spec: this._sensorTypeCodeSpecId, scope: this._definitionModelId, value: name },
    };
    return this._iModelDb.elements.insertElement(sensorTypeProps);
  }

  private insertObservationType(sensorTypeId: Id64String, codeValue: string, unitName: string, minValue: number, maxValue: number): Id64String {
    const observationTypeProps: ObservationTypeProps = {
      classFullName: "IoTDevices:ObservationType",
      model: this._definitionModelId,
      code: { spec: this._observationTypeCodeSpecId, scope: this._definitionModelId, value: codeValue },
      unitName,
      minValue,
      maxValue,
    };
    const observationTypeId: Id64String = this._iModelDb.elements.insertElement(observationTypeProps);
    this._iModelDb.relationships.insertInstance({
      classFullName: "IoTDevices:SensorTypeHasObservationTypes",
      sourceId: sensorTypeId,
      targetId: observationTypeId,
    });
    return observationTypeId;
  }

  private insertSensor(typeDefinitionId: Id64String, name: string, origin: XYZProps): Id64String {
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
    return this._iModelDb.elements.insertElement(sensorProps);
  }

  private createSensorGeometry(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(cylinder);
    return geometryStreamBuilder.geometryStream;
  }

  private insertView(): Id64String {
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const viewExtents: AxisAlignedBox3d = physicalModel.queryExtents();
    const modelSelectorId = ModelSelector.insert(this._iModelDb, this._definitionModelId, "Sensor Models", [this._physicalModelId]);
    const categorySelectorId = CategorySelector.insert(this._iModelDb, this._definitionModelId, "Sensor Categories", [this._sensorCategoryId]);
    const displayStyleId = DisplayStyle3d.insert(this._iModelDb, this._definitionModelId, "Display Style");
    const viewId = OrthographicViewDefinition.insert(this._iModelDb, this._definitionModelId, "Sensor View", modelSelectorId, categorySelectorId, displayStyleId, viewExtents, StandardViewIndex.Iso);
    this._iModelDb.views.setDefaultViewId(viewId);
    return viewId;
  }
}
