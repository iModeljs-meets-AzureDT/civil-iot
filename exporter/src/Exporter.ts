import { DbResult, Id64String, Logger, LogLevel, Id64 } from "@bentley/bentleyjs-core";
import { ECSqlStatement, IModelDb, IModelJsFs, Element, IModelExportHandler, IModelExporter, Model } from "@bentley/imodeljs-backend";
import * as path from "path";

const loggerCategory = "civil-iot-exporter";

function writeLine(outputFileName: string, line: string, indentLevel: number = 0): void {
  if (indentLevel > 0) {
    for (let i = 0; i < indentLevel; i++) { IModelJsFs.appendFileSync(outputFileName, "  "); }
  }
  IModelJsFs.appendFileSync(outputFileName, line);
  IModelJsFs.appendFileSync(outputFileName, "\n");
}

export class Exporter {
  public iModelDb: IModelDb;
  public outputDir: string;

  public constructor(iModelDb: IModelDb) {
    this.iModelDb = iModelDb;
    this.outputDir = path.join(__dirname, "out");
    if (IModelJsFs.existsSync(this.outputDir)) {
      IModelJsFs.removeSync(this.outputDir);
    }
    IModelJsFs.mkdirSync(this.outputDir);
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
    this.exportInstancesOf("RoadPhysical:Roadway");
    this.exportInstancesOf("RailPhysical:RailNetwork");
    this.exportModels();
  }

  public exportSchemas(): void {
    const schemaOutputDir = path.join(__dirname, "out", "schemas");
    if (!IModelJsFs.existsSync(schemaOutputDir)) {
      IModelJsFs.mkdirSync(schemaOutputDir);
    }
    this.iModelDb.nativeDb.exportSchemas(schemaOutputDir);
  }

  public exportClassCount(): void {
    const outputFileName: string = path.join(this.outputDir, "class-count.csv");
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
    const outputFileName: string = path.join(this.outputDir, classFullName.replace(":", "-") + "-Instances.csv");
    const elementExporter = new ElementExporter(this.iModelDb, outputFileName);
    this.iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${classFullName}`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const elementId: Id64String = statement.getValue(0).getId();
        elementExporter.exportElement(elementId);
        writeLine(outputFileName, "");
      }
    });
  }

  public exportModels(): void {
    const outputFileName: string = path.join(this.outputDir, "models.csv");
    this.iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${Model.classFullName}`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const modelId: Id64String = statement.getValue(0).getId();
        const model: Model = this.iModelDb.models.getModel(modelId);
        writeLine(outputFileName, `${model.id}, ${model.classFullName}, ${model.name}`);
      }
    });
  }
}

/** Specialization of IModelExport that exports to an output text file. */
class ElementExporter extends IModelExportHandler {
  public outputFileName: string;
  public exporter: IModelExporter;

  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    this.outputFileName = outputFileName;
    this.exporter = new IModelExporter(sourceDb);
    this.exporter.registerHandler(this);
  }
  public exportElement(elementId: Id64String): void {
    this.exporter.exportElement(elementId);
  }
  private getIndentLevelForElement(element: Element): number {
    if ((undefined !== element.parent) && (Id64.isValidId64(element.parent.id))) {
      const parentElement: Element = this.exporter.sourceDb.elements.getElement(element.parent.id);
      return 1 + this.getIndentLevelForElement(parentElement);
    }
    return 0;
  }
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const indentLevel: number = this.getIndentLevelForElement(element);
    writeLine(this.outputFileName, `${element.classFullName}, ${element.id}, ${element.getDisplayLabel()}`, indentLevel);
    super.onExportElement(element, isUpdate);
  }
}
