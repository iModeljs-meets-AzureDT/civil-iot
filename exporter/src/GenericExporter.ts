import { DbResult, GuidString, Id64, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ECSqlStatement, Element, IModelDb, IModelExporter, IModelExportHandler, IModelJsFs, Model } from "@bentley/imodeljs-backend";
import { ElementProps, IModel } from "@bentley/imodeljs-common";
import * as path from "path";
import { FileSystemUtils } from "./FileSystemUtils";

const loggerCategory = "GenericExporter";

export class GenericExporter {
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
            FileSystemUtils.writeLine(outputFileName, `${count}, ${classFullName}`);
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
        FileSystemUtils.writeLine(outputFileName, JSON.stringify(elementProps, undefined, 2));
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
        FileSystemUtils.writeLine(outputFileName, `${model.id}, ${model.classFullName}, ${model.name}`);
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
            FileSystemUtils.writeLine(outputFileName, JSON.stringify(elementProps, undefined, 2));
          }
        }
      });
    }
  }

  private queryFederationGuid(elementId: Id64String): GuidString | undefined {
    const sql = `SELECT FederationGuid FROM ${Element.classFullName} WHERE ECInstanceId=:elementId`;
    return this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String | undefined => {
      statement.bindId("elementId", elementId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getGuid() : undefined;
    });
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
    FileSystemUtils.writeLine(this.outputFileName, JSON.stringify(element));
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
