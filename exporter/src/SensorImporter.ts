import { DbResult, GuidString, Id64, Id64String, IModelStatus, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Box, Cone, Point3d, StandardViewIndex, Vector3d, XYZProps } from "@bentley/geometry-core";
import { BackendLoggerCategory, BackendRequestContext, CategorySelector, DefinitionModel, DisplayStyle3d, ECSqlStatement, ElementGroupsMembers, ElementOwnsChildElements, GeometricElement3dHasTypeDefinition, GroupModel, IModelDb, IModelJsFs, ModelSelector, OrthographicViewDefinition, PhysicalModel, SpatialCategory, Subject } from "@bentley/imodeljs-backend";
import { AxisAlignedBox3d, Code, CodeScopeSpec, ColorDef, GeometricElement3dProps, GeometryStreamBuilder, GeometryStreamProps, IModel, IModelError, RelatedElement, RenderMode, TypeDefinitionElementProps, ViewFlags } from "@bentley/imodeljs-common";
import { ObservationTypeProps } from "./IoTDevices";
import { CompositionItemProps, RoadNetworkClassification } from "./RoadNetworkComposition";

const loggerCategory = "sensor-importer";

export class SensorImporter {
  private _iModelDb: IModelDb;
  private _physicalModelId!: Id64String;
  private _definitionModelId!: Id64String;
  private _compositionModelId!: Id64String;
  private _sensorCategoryId!: Id64String;
  // private _physicalObjectCategoryId!: Id64String;
  private _sensorTypeCodeSpecId!: Id64String;
  private _observationTypeCodeSpecId!: Id64String;
  private _sensorCodeSpecId!: Id64String;
  private _physicalObjectCodeSpecId!: Id64String;
  private _compositionCodeSpecId!: Id64String;

  public constructor(iModelDb: IModelDb) {
    this._iModelDb = iModelDb;
    if (true) { // initialize logging
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(BackendLoggerCategory.IModelDb, LogLevel.Warning);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  }

  public async import(schemaFiles: string[], inputDataFile: string, isAugment: boolean): Promise<void> {
    await this.importSchema(schemaFiles);
    this.insertCodeSpecs();
    this.insertRepositoryModelHierarchy();
    this.insertCategories();
    this.insertData(inputDataFile);
    if (!isAugment) {
      this.updateProjectExtents();
    }
    this.insertSensorView();
  }

  private async importSchema(schemaFiles: string[]): Promise<void> {
    await this._iModelDb.importSchemas(new BackendRequestContext(), schemaFiles);
  }

  private insertCodeSpecs(): void {
    this._sensorTypeCodeSpecId = this._iModelDb.codeSpecs.insert("SensorType", CodeScopeSpec.Type.Model);
    this._observationTypeCodeSpecId = this._iModelDb.codeSpecs.insert("ObservationType", CodeScopeSpec.Type.Model);
    this._sensorCodeSpecId = this._iModelDb.codeSpecs.insert("Sensor", CodeScopeSpec.Type.Repository);
    this._compositionCodeSpecId = this._iModelDb.codeSpecs.insert("Composition", CodeScopeSpec.Type.Repository);
    this._physicalObjectCodeSpecId = this._iModelDb.codeSpecs.insert("PhysicalObject", CodeScopeSpec.Type.Repository);
  }

  private insertRepositoryModelHierarchy(): void {
    const subjectId: Id64String = Subject.insert(this._iModelDb, IModel.rootSubjectId, "IoT");
    this._definitionModelId = DefinitionModel.insert(this._iModelDb, subjectId, "IoT Definitions");
    this._physicalModelId = PhysicalModel.insert(this._iModelDb, subjectId, "Sensors");
    this._compositionModelId = GroupModel.insert(this._iModelDb, subjectId, "Road Network Composition");
  }

  private insertCategories(): void {
    // this._physicalObjectCategoryId = SpatialCategory.insert(this._iModelDb, this._definitionModelId, "Physical Objects", { color: ColorDef.green });
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
    // if (inputData.physicalObjects) {
    //   inputData.physicalObjects.forEach((physicalObjectData: any) => {
    //     this.insertPhysicalObject(physicalObjectData.name, physicalObjectData.size, physicalObjectData.placement);
    //   });
    // }
    if (inputData.compositions) {
      inputData.compositions.forEach((compositionData: any) => {
        this.insertCompositionElement(compositionData.name, compositionData.type, compositionData.classification, compositionData.parent, compositionData.groups);
      });
    }
    if (inputData.sensors) {
      inputData.sensors.forEach((sensorData: any) => {
        this.insertSensor(sensorData.name, sensorData.type, sensorData.origin, sensorData.observes);
      });
    }
    if (inputData.views) {
      inputData.views.forEach((viewData: any) => {
        const displayStyleId: Id64String | undefined = this.queryByCodeValue(DisplayStyle3d.classFullName, viewData.displayStyle);
        this.insertView(viewData.name, viewData.models, viewData.categories, displayStyleId);
      });
    }
  }

  private insertCompositionElement(name: string, className: string, classification: RoadNetworkClassification, parentIdOrCode?: Id64String | string, groupedIdsOrCodes?: Id64String[] | string[]): Id64String {
    let parent: RelatedElement | undefined;
    if (parentIdOrCode) {
      if (Id64.isValidId64(parentIdOrCode)) {
        parent = new ElementOwnsChildElements(parentIdOrCode);
      } else {
        const parentId: Id64String | undefined = this.tryQueryCompositionElementByCode(parentIdOrCode);
        if (undefined !== parentId) {
          parent = new ElementOwnsChildElements(parentId);
        }
      }
    }
    const elementProps: CompositionItemProps = {
      classFullName: `RoadNetworkComposition:${className}`,
      model: this._compositionModelId,
      code: { spec: this._compositionCodeSpecId, scope: IModel.rootSubjectId, value: name },
      parent,
      classification,
    };
    const compositionElementId: Id64String = this._iModelDb.elements.insertElement(elementProps);
    if (groupedIdsOrCodes) {
      groupedIdsOrCodes.forEach((groupedIdOrCode: Id64String | string) => {
        let groupedId: Id64String | undefined;
        if (Id64.isValidId64(groupedIdOrCode)) {
          groupedId = groupedIdOrCode;
        } else {
          groupedId = this.tryQueryPhysicalObjectByCode(groupedIdOrCode);
        }
        if (groupedId) {
          ElementGroupsMembers.insert(this._iModelDb, compositionElementId, groupedId);
        }
      });
    }
    return compositionElementId;
  }

  private tryQueryCompositionElementByCode(codeValue: string): Id64String | undefined {
    return this._iModelDb.elements.queryElementIdByCode(new Code({ spec: this._compositionCodeSpecId, scope: IModel.rootSubjectId, value: codeValue }));
  }

  // private insertPhysicalObject(name: string, size: XYZProps, placement: Placement3dProps): Id64String {
  //   const boxGeometry: GeometryStreamProps = this.createBox(size);
  //   const elementProps: GeometricElement3dProps = {
  //     classFullName: PhysicalObject.classFullName,
  //     model: this._physicalModelId,
  //     category: this._physicalObjectCategoryId,
  //     code: { spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: name },
  //     placement,
  //     geom: boxGeometry,
  //   };
  //   return this._iModelDb.elements.insertElement(elementProps);
  // }

  private tryQueryPhysicalObjectByCode(codeValue: string): Id64String | undefined {
    return this._iModelDb.elements.queryElementIdByCode(new Code({ spec: this._physicalObjectCodeSpecId, scope: IModel.rootSubjectId, value: codeValue }));
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

  private tryQuerySensorTypeByCode(codeValue: string): Id64String | undefined {
    return this._iModelDb.elements.queryElementIdByCode(new Code({ spec: this._sensorTypeCodeSpecId, scope: this._definitionModelId, value: codeValue }));
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

  private insertSensor(name: string, sensorTypeIdOrCode: Id64String | string, originXYZ: XYZProps, observedIdOrCode: Id64String | string): Id64String {
    const origin = Point3d.fromJSON(originXYZ);
    if (!this._iModelDb.projectExtents.containsXYZ(origin.x, origin.y, origin.z)) {
      Logger.logError(loggerCategory, `"${name}" with origin "${JSON.stringify(origin)}" is outside projectExtents "${JSON.stringify(this._iModelDb.projectExtents)}"`);
    }
    let sensorType: RelatedElement | undefined;
    if (Id64.isValidId64(sensorTypeIdOrCode)) {
      sensorType = new GeometricElement3dHasTypeDefinition(sensorTypeIdOrCode);
    } else {
      const sensorTypeId: Id64String | undefined = this.tryQuerySensorTypeByCode(sensorTypeIdOrCode);
      if (undefined !== sensorTypeId) {
        sensorType = new GeometricElement3dHasTypeDefinition(sensorTypeId);
      }
    }
    const sensorProps: GeometricElement3dProps = {
      classFullName: "IoTDevices:Sensor",
      model: this._physicalModelId,
      category: this._sensorCategoryId,
      code: { spec: this._sensorCodeSpecId, scope: IModel.rootSubjectId, value: name },
      placement: { origin, angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createSensorGeometry(0.2),
      typeDefinition: sensorType,
      jsonProperties: sensorType ? { iot: { sensorTypeIndex: this.getNextSensorTypeIndex(sensorType.id) } } : undefined,
    };
    const sensorId: Id64String = this._iModelDb.elements.insertElement(sensorProps);
    const observedId = Id64.isValidId64(observedIdOrCode) ? observedIdOrCode : this.tryQueryCompositionElementByCode(observedIdOrCode);
    if (undefined !== observedId) {
      this._iModelDb.relationships.insertInstance({
        classFullName: "IoTDevices:SensorObservesElement",
        sourceId: sensorId,
        targetId: observedId,
      });
    }
    return sensorId;
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

  private insertSensorView(): Id64String {
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const viewExtents: AxisAlignedBox3d = physicalModel.queryExtents();
    if (!this._iModelDb.projectExtents.containsRange(viewExtents)) {
      Logger.logError(loggerCategory, "insertView - projectExtents problem");
    }
    const modelSelectorId = ModelSelector.insert(this._iModelDb, this._definitionModelId, "Sensor Models", [this._physicalModelId]);
    const categorySelectorId = CategorySelector.insert(this._iModelDb, this._definitionModelId, "Sensor Categories", [this._sensorCategoryId /*, this._physicalObjectCategoryId */]);
    const displayStyleId = DisplayStyle3d.insert(this._iModelDb, this._definitionModelId, "Display Style");
    return OrthographicViewDefinition.insert(this._iModelDb, this._definitionModelId, "Sensor View", modelSelectorId, categorySelectorId, displayStyleId, viewExtents, StandardViewIndex.Iso);
  }

  private insertView(viewName: string, modelIds: Id64String[], categoryCodes: string[], displayStyleId?: Id64String): Id64String {
    // Query the extents of the Sensor PhysicalModel to set the extents of the view
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const viewExtents: AxisAlignedBox3d = physicalModel.queryExtents();
    // Insert a ModelSelector that contains the specified models
    const modelSelectorId = ModelSelector.insert(this._iModelDb, this._definitionModelId, `${viewName} Models`, modelIds.concat([this._physicalModelId]));
    // Insert a CategorySelector that contains the specified categories
    const categoryIds: Id64String[] = categoryCodes.map((categoryCode: string) => {
      return this._iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this._iModelDb, IModel.dictionaryId, categoryCode))!;
    });
    const categorySelectorId = CategorySelector.insert(this._iModelDb, this._definitionModelId, `${viewName} Categories`, categoryIds.concat(["0x2000000017d"]));
    // Ensure a DisplayStyle with certain attributes
    if (undefined === displayStyleId) { // If a DisplayStyle was not provided, create a default one
      displayStyleId = DisplayStyle3d.insert(this._iModelDb, this._definitionModelId, `${viewName} Display Style`);
    }
    const displayStyle: DisplayStyle3d = this._iModelDb.elements.getElement<DisplayStyle3d>(displayStyleId);
    const viewFlags = new ViewFlags();
    viewFlags.renderMode = RenderMode.SmoothShade;
    viewFlags.visibleEdges = false;
    viewFlags.lighting = true;
    displayStyle.settings.environment = { sky: { display: true } };
    displayStyle.settings.viewFlags = viewFlags;
    displayStyle.update();
    // Insert the ViewDefinition
    const viewId = OrthographicViewDefinition.insert(this._iModelDb, this._definitionModelId, viewName, modelSelectorId, categorySelectorId, displayStyleId, viewExtents, StandardViewIndex.Iso);
    this._iModelDb.views.setDefaultViewId(viewId);
    return viewId;
  }

  private updateProjectExtents(): void {
    const physicalModel: PhysicalModel = this._iModelDb.models.getModel<PhysicalModel>(this._physicalModelId);
    const extents: AxisAlignedBox3d = physicalModel.queryExtents();
    extents.expandInPlace(10);
    this._iModelDb.updateProjectExtents(extents);
  }

  private queryByCodeValue(classFullName: string, codeValue: string): Id64String | undefined {
    const sql = `SELECT ECInstanceId FROM ${classFullName} WHERE CodeValue=:codeValue`;
    return this._iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String | undefined => {
      statement.bindString("codeValue", codeValue);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    });
  }
}
