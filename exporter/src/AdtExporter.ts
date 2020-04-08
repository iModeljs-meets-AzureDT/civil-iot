import { DbResult, GuidString, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ECSqlStatement, Element, IModelDb, IModelJsFs, PhysicalObject } from "@bentley/imodeljs-backend";
import { ElementProps, GeometricElement3dProps } from "@bentley/imodeljs-common";
import { FileSystemUtils } from "./FileSystemUtils";
import { ObservationTypeProps } from "./IoTDevices";

const loggerCategory = "AdtExporter";

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

export class AdtExporter {
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
    this.exportAdtTypes();
    this.exportAdtInstances();
  }

  public exportAdtTypes(): void {
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
    FileSystemUtils.writeJsonFile(this.outputDir, "adt-types.json", [physicalObjectClass, sensorClass]);
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

  public exportAdtInstances(): void {
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
    FileSystemUtils.writeJsonFile(this.outputDir, "adt-instances.json", container);
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

  private buildElementUrn(elementId: Id64String): string {
    return `urn:iModel-element:${this.iModelDb.iModelId}#${elementId}`;
  }
}
