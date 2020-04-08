import { DbResult, Id64, Id64String, Logger, LogLevel, GuidString } from "@bentley/bentleyjs-core";
import { ECSqlStatement, Element, IModelDb, IModelExporter, IModelExportHandler, IModelJsFs, Model, PhysicalObject } from "@bentley/imodeljs-backend";
import { ElementProps, GeometricElement3dProps, IModel } from "@bentley/imodeljs-common";
import { FileSystemUtils } from "./FileSystemUtils";
import { ObservationTypeProps } from "./IoTDevices";
import * as path from "path";

const loggerCategory = "civil-iot-exporter";

function writeLine(outputFileName: string, line: string, indentLevel: number = 0): void {
  if (indentLevel > 0) {
    for (let i = 0; i < indentLevel; i++) { IModelJsFs.appendFileSync(outputFileName, "  "); }
  }
  IModelJsFs.appendFileSync(outputFileName, line);
  IModelJsFs.appendFileSync(outputFileName, "\n");
}

interface AdtPropertyDef {
  "@type": "Property";
  "name": string;
  "schema": string;
}

interface AdtRelationshipDef {
  "@type": "Relationship";
  "name": string;
  "target": string;
}

interface AdtTelemetryDef {
  "@type": "Telemetry";
  "name": string;
  "schema": string;
}

type AdtMemberDef = AdtPropertyDef | AdtRelationshipDef | AdtTelemetryDef;

export class Exporter {
  public iModelDb: IModelDb;
  public outputDir: string;

  public constructor(iModelDb: IModelDb, outputDir: string) {
    this.iModelDb = iModelDb;
    this.outputDir = outputDir;
    if (!IModelJsFs.existsSync(this.outputDir)) {
      IModelJsFs.mkdirSync(this.outputDir);
    }
    // initialize logging
    if (true) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  }

  public exportAll(): void {
    if (false) {
      this.exportSchemas();
      this.exportClassCount();
      this.exportInstancesOf("RoadPhysical:RoadNetwork");
      this.exportInstancesOf("RailPhysical:RailNetwork");
      this.exportInstancesOf("BridgeStructuralPhysical:Bridge");
      this.exportModels();
      this.exportInstancesWithProperty("Description");
      this.exportHierarchy();
      this.exportInstancesOf("BisCore:SpatialElement");
      this.exportInstancesOf("BisCore:GraphicalElement3d");
    }
    this.exportAdtTypes();
    this.exportForAdt();
  }

  public exportAdtTypes(): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, "adt-types.json");
    const physicalObjectClass = this.createAdtTypeObject(PhysicalObject.className, [
      { "@type": "Property", "schema": "string", "name": "name" }, // SpatialElement.CodeValue
      { "@type": "Property", "schema": "double", "name": "computedHealth" }, // Computed by an Azure Function in ADT
    ]);
    const sensorClass = this.createAdtTypeObject("Sensor", [
      { "@type": "Property", "schema": "string", "name": "name" }, // Sensor.CodeValue
      { "@type": "Property", "schema": "string", "name": "type" }, // SensorType.CodeValue
      { "@type": "Relationship", "target": this.buildAdtTypeUrn(PhysicalObject.className), "name": "observes" }, // SensorObservesSpatialElement
      // WIP: should be an array of ObservationTypes!
      { "@type": "Property", "schema": "string", "name": "observationLabel1" },
      { "@type": "Property", "schema": "string", "name": "observationUnit1" },
      { "@type": "Telemetry", "schema": "double", "name": "observationValue1" },
      { "@type": "Property", "schema": "string", "name": "observationLabel2" },
      { "@type": "Property", "schema": "string", "name": "observationUnit2" },
      { "@type": "Telemetry", "schema": "double", "name": "observationValue2" },
    ]);
    writeLine(outputFileName, JSON.stringify([physicalObjectClass, sensorClass], undefined, 2));
  }

  private createAdtTypeObject(className: string, memberDefs: AdtMemberDef[]): any {
    return {
      "@id": this.buildAdtTypeUrn(className),
      "@type": "Interface",
      "@context": "http://azure.com/v3/contexts/Model.json",
      "displayName": className,
      "contents": memberDefs,
    };
  }

  public exportForAdt(): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, "for-adt.json");
    const iotSimulationId: GuidString = "28f13042-3e04-4025-8e6b-8c1ff0f16def";
    const observedObjects: any[] = [];
    const observedSql = "SELECT DISTINCT TargetECInstanceId FROM IoTDevices:SensorObservesSpatialElement";
    this.iModelDb.withPreparedStatement(observedSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const observedElementId: Id64String = statement.getValue(0).getId();
        const observedElementProps: ElementProps = this.iModelDb.elements.getElementProps(observedElementId);
        const observedObject = this.createAdtInstance(observedElementProps);
        observedObject.computedHealth = 0.0; // will be populated by the Azure Function on the ADT side
        observedObjects.push(observedObject);
      }
    });
    const observationTypes: any[] = [];
    const observationTypeSql = "SELECT ECInstanceId FROM IoTDevices:ObservationType";
    this.iModelDb.withPreparedStatement(observationTypeSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const observationTypeId: Id64String = statement.getValue(0).getId();
        const observationTypeProps: ObservationTypeProps = this.iModelDb.elements.getElementProps(observationTypeId);
        const observationType = this.createAdtInstance(observationTypeProps);
        observationType.unit = observationTypeProps.unit;
        observationTypes.push(observationType);
      }
    });
    const sensorTypes: any[] = [];
    const sensorTypeSql = "SELECT ECInstanceId FROM IoTDevices:SensorType ORDER BY ECInstanceId";
    this.iModelDb.withPreparedStatement(sensorTypeSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const elementId: Id64String = statement.getValue(0).getId();
        const elementProps: ElementProps = this.iModelDb.elements.getElementProps(elementId);
        sensorTypes.push(this.createAdtInstance(elementProps));
      }
    });
    const sensorInstances: any[] = [];
    const sensorSql = "SELECT ECInstanceId,TypeDefinition.Id FROM IoTDevices:Sensor ORDER BY ECInstanceId";
    this.iModelDb.withPreparedStatement(sensorSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const sensorId: Id64String = statement.getValue(0).getId();
        const sensorTypeId: Id64String = statement.getValue(1).getId();
        const sensorTypeFederationGuid: GuidString | undefined = this.queryFederationGuid(sensorTypeId);
        const sensorProps: GeometricElement3dProps = this.iModelDb.elements.getElementProps(sensorId);
        const sensorInstance = this.createAdtInstance(sensorProps);
        if (sensorProps.typeDefinition?.id) {
          sensorInstance.isOfType = this.buildElementUrn(sensorProps.typeDefinition.id);
        }
        const observedElementId: Id64String | undefined = this.queryObservedElement(sensorProps.id!);
        if (undefined !== observedElementId) {
          sensorInstance.observes = this.buildElementUrn(observedElementId);
        }
        if ((undefined !== sensorTypeFederationGuid) && sensorProps?.jsonProperties?.iot?.sensorTypeIndex) {
          sensorInstance.deviceId = `${iotSimulationId}.${sensorTypeFederationGuid}.${sensorProps.jsonProperties.iot.sensorTypeIndex}`;
        }
        sensorInstances.push(sensorInstance);
      }
    });
    const container = {
      observedObjects,
      observationTypes,
      sensorTypes,
      sensorInstances,
    };
    writeLine(outputFileName, JSON.stringify(container, undefined, 2));
  }

  private queryObservedElement(sensorId: Id64String): Id64String | undefined {
    const sql = "SELECT TargetECInstanceId FROM IoTDevices:SensorObservesSpatialElement WHERE SourceECInstanceId=:sensorId LIMIT 1";
    return this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String | undefined => {
      statement.bindId("sensorId", sensorId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    });
  }

  private queryFederationGuid(elementId: Id64String): GuidString | undefined {
    const sql = `SELECT FederationGuid FROM ${Element.classFullName} WHERE ECInstanceId=:elementId`;
    return this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String | undefined => {
      statement.bindId("elementId", elementId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getGuid() : undefined;
    });
  }

  private createAdtInstance(elementProps: ElementProps): any {
    return {
      "@id": this.buildElementUrn(elementProps.id!),
      "@type": this.buildAdtTypeUrn(elementProps.classFullName.split(":")[1]),
      "name": elementProps.code.value,
      "federationGuid": elementProps.federationGuid,
    };
  }

  private buildAdtTypeUrn(className: string): string {
    const versionNumber = 1; // needs to be incremented each time the schema changes after it has been uploaded to ADT
    return `urn:civil-iot:adt-type:${className}:${versionNumber}`;
  }

  private buildContextUrn(): string {
    return `urn:iModel:${this.iModelDb.iModelId}`;
  }

  private buildElementUrn(elementId: Id64String): string {
    return `urn:iModel-element:${this.iModelDb.iModelId}#${elementId}`;
  }

  public exportSchemas(): void {
    const schemaOutputDir = path.join(__dirname, "out", "schemas");
    if (!IModelJsFs.existsSync(schemaOutputDir)) {
      IModelJsFs.mkdirSync(schemaOutputDir);
    }
    this.iModelDb.nativeDb.exportSchemas(schemaOutputDir);
  }

  public exportClassCount(): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, "class-count.csv");
    this.iModelDb.withPreparedStatement(`SELECT DISTINCT ECClassId FROM ${Element.classFullName}`, (classStatement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === classStatement.step()) {
        const classFullName: string = classStatement.getValue(0).getClassNameForClassId();
        this.iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (countStatement: ECSqlStatement): void => {
          while (DbResult.BE_SQLITE_ROW === countStatement.step()) {
            const count: number = countStatement.getValue(0).getInteger();
            writeLine(outputFileName, `${count}, ${classFullName}`);
          }
        });
      }
    });
  }

  public exportInstancesOf(classFullName: string): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, classFullName.replace(":", "-") + "-Instances.csv");
    const elementExporter = new ElementExporter(this.iModelDb, outputFileName);
    this.iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${classFullName}`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const elementId: Id64String = statement.getValue(0).getId();
        const elementProps: ElementProps = this.iModelDb.elements.getElementProps(elementId);
        writeLine(outputFileName, JSON.stringify(elementProps, undefined, 2));
        // elementExporter.exportElement(elementId);
        // writeLine(outputFileName, "");
      }
    });
  }

  public exportModels(): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, "models.csv");
    this.iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${Model.classFullName}`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const modelId: Id64String = statement.getValue(0).getId();
        const model: Model = this.iModelDb.models.getModel(modelId);
        writeLine(outputFileName, `${model.id}, ${model.classFullName}, ${model.name}`);
      }
    });
  }

  public exportHierarchy(): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, "complete-hierarchy.csv");
    // const elementExporter = new IModelToTextFileExporter(this.iModelDb, outputFileName);
    const elementExporter = new ElementExporter(this.iModelDb, outputFileName);
    elementExporter.exportElement(IModel.rootSubjectId);
  }

  private findClassIdsWithProperty(propertyName: string): Id64String[] {
    const classIds: Id64String[] = [];
    this.iModelDb.withPreparedStatement(`SELECT Class FROM ECDbMeta:ECPropertyDef WHERE Name='${propertyName}'`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const classId: Id64String = statement.getValue(0).getNavigation().id;
        const elementSql = `SELECT ECInstanceId FROM ${Element.classFullName} WHERE ECClassId=:classId LIMIT 1`;
        this.iModelDb.withPreparedStatement(elementSql, (elementStatement: ECSqlStatement): void => {
          elementStatement.bindId("classId", classId);
          if (DbResult.BE_SQLITE_ROW === elementStatement.step()) {
            classIds.push(classId);
          }
        });
      }
    });
    return classIds;
  }

  private resolveClassFullNames(classIds: Id64String[]): string[] {
    const classFullNames: string[] = [];
    for (const classId of classIds) {
      const sql = "SELECT c.Name,s.Name FROM ECDbMeta:ECClassDef c, ECDbMeta:ECSchemaDef s WHERE c.ECInstanceId=? AND c.Schema.Id=s.ECInstanceId";
      this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
        statement.bindId(1, classId);
        if (DbResult.BE_SQLITE_ROW === statement.step()) {
          const className: string = statement.getValue(0).getString();
          const schemaName: string = statement.getValue(1).getString();
          classFullNames.push(`${schemaName}:${className}`);
        }
      });
    }
    return classFullNames;
  }

  public exportInstancesWithProperty(propertyName: string): void {
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, `instances-with-${propertyName}.csv`);
    const classFullNames: string[] = this.resolveClassFullNames(this.findClassIdsWithProperty(propertyName));
    for (const classFullName of classFullNames) {
      const sql = `SELECT ECInstanceId FROM ${classFullName} WHERE ${propertyName} IS NOT NULL`;
      this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
        while (DbResult.BE_SQLITE_ROW === statement.step()) {
          const elementId: Id64String = statement.getValue(0).getId();
          const elementProps: ElementProps | undefined = this.iModelDb.elements.tryGetElementProps(elementId);
          if (undefined !== elementProps) {
            writeLine(outputFileName, JSON.stringify(elementProps, undefined, 2));
          }
        }
      });
    }
  }
}

/** Specialization of IModelExport that exports to an output text file. */
class ElementExporter extends IModelExportHandler {
  public outputFileName: string;
  public exporter: IModelExporter;
  private _modelIndentLevel: number = 0;

  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    this.outputFileName = outputFileName;
    this.exporter = new IModelExporter(sourceDb);
    this.exporter.registerHandler(this);
  }
  public exportElements(elementIds: Id64String[]): void {
    elementIds.forEach((elementId: Id64String) => this.exportElement(elementId));
  }
  public exportElement(elementId: Id64String): void {
    this.exporter.exportElement(elementId);
    this.exportSubModel(elementId);
  }
  private exportSubModel(elementId: Id64String): void {
    const subModel: Model | undefined = this.exporter.sourceDb.models.tryGetSubModel(elementId);
    if (subModel) {
      this._modelIndentLevel++;
      this.exporter.exportModelContents(subModel.id);
      this._modelIndentLevel--;
    }
  }
  private getIndentLevelForElement(element: Element): number {
    if ((undefined !== element.parent) && (Id64.isValidId64(element.parent.id))) {
      const parentElement: Element = this.exporter.sourceDb.elements.getElement(element.parent.id);
      return 1 + this.getIndentLevelForElement(parentElement);
    }
    return 0;
  }
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const indentLevel: number = this.getIndentLevelForElement(element) + this._modelIndentLevel;
    // writeLine(this.outputFileName, `${element.classFullName}, ${element.id}, ${element.getDisplayLabel()}`, indentLevel);
    writeLine(this.outputFileName, JSON.stringify(element));
    this.exportSubModel(element.id);
    super.onExportElement(element, isUpdate);
  }
}

/** Specialization of IModelExport that exports to an output text file. */
class IModelToTextFileExporter extends IModelExportHandler {
  public outputFileName: string;
  public exporter: IModelExporter;
  private _shouldIndent: boolean = true;
  private _firstFont: boolean = true;
  private _firstRelationship: boolean = true;
  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    this.outputFileName = outputFileName;
    this.exporter = new IModelExporter(sourceDb);
    this.exporter.registerHandler(this);
  }
  public export(): void {
    this._shouldIndent = true;
    this.exporter.exportAll();
  }
  private writeLine(line: string, indentLevel: number = 0): void {
    if (this._shouldIndent) {
      for (let i = 0; i < indentLevel; i++) {
        IModelJsFs.appendFileSync(this.outputFileName, "  ");
      }
    }
    IModelJsFs.appendFileSync(this.outputFileName, line);
    IModelJsFs.appendFileSync(this.outputFileName, "\n");
  }
  private writeSeparator(): void {
    this.writeLine("--------------------------------");
  }
  private formatOperationName(isUpdate: boolean | undefined): string {
    if (undefined === isUpdate) return "";
    return isUpdate ? ", UPDATE" : ", INSERT";
  }
  private getIndentLevelForElement(element: Element): number {
    if (!this._shouldIndent) {
      return 0;
    }
    if ((undefined !== element.parent) && (Id64.isValidId64(element.parent.id))) {
      const parentElement: Element = this.exporter.sourceDb.elements.getElement(element.parent.id);
      return 1 + this.getIndentLevelForElement(parentElement);
    }
    return 1;
  }
  protected onExportModel(model: Model, isUpdate: boolean | undefined): void {
    this.writeSeparator();
    this.writeLine(`[Model] ${model.classFullName}, ${model.id}, ${model.name}${this.formatOperationName(isUpdate)}`);
    super.onExportModel(model, isUpdate);
  }
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const indentLevel: number = this.getIndentLevelForElement(element);
    this.writeLine(`[Element] ${element.classFullName}, ${element.id}, ${element.getDisplayLabel()}${this.formatOperationName(isUpdate)}`, indentLevel);
    super.onExportElement(element, isUpdate);
  }
}
