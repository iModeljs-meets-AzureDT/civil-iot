import { DbResult, GuidString, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ECSqlStatement, Element, IModelDb, IModelJsFs, PhysicalObject } from "@bentley/imodeljs-backend";
import { ElementProps, GeometricElement3dProps, TypeDefinitionElementProps } from "@bentley/imodeljs-common";
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
    const compositionClasses: any[] = this.createCompositionTypes();
    const sensorClass = this.createAdtTypeObject("Sensor", [
      { "@type": "Property", "schema": "string", "name": "name" }, // Sensor.CodeValue
      { "@type": "Property", "schema": "string", "name": "type" }, // SensorType.CodeValue
      { "@type": "Property", "schema": "string", "name": "deviceId" }, // deviceId in IoT Hub
      { "@type": "Relationship", "target": this.buildAdtTypeUrn(PhysicalObject.className), "name": "observes" }, // SensorObservesElement
      // WIP: should be an array of ObservationTypes!
      { "@type": "Property", "schema": "string", "name": "observationLabel1" },
      { "@type": "Property", "schema": "string", "name": "observationUnit1" },
      { "@type": "Telemetry", "schema": "double", "name": "observationValue1" },
      { "@type": "Property", "schema": "string", "name": "observationLabel2" },
      { "@type": "Property", "schema": "string", "name": "observationUnit2" },
      { "@type": "Telemetry", "schema": "double", "name": "observationValue2" },
    ]);
    FileSystemUtils.writeJsonFile(this.outputDir, "adt-types.json", compositionClasses.concat(sensorClass));
  }

  private createCompositionTypes(): any[] {
    const sql = "SELECT DISTINCT ECClassId FROM RoadNetworkComposition:CompositionItem";
    const compositionTypeNames: string[] = this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): string[] => {
      const classNames: string[] = [];
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        classNames.push(statement.getValue(0).getClassNameForClassId().split(".")[1]);
      }
      return classNames;
    });
    return compositionTypeNames.map((compositionTypeName: string) => {
      return this.createAdtTypeObject(compositionTypeName, [
        { "@type": "Property", "schema": "string", "name": "name" }, // Element.CodeValue
        { "@type": "Property", "schema": "string", "name": "classification" }, // CompositionItem.Classification
        { "@type": "Property", "schema": "double", "name": "computedHealth" }, // Computed by an Azure Function in ADT
      ]);
    });
  }

  public exportAdtInstances(): void {
    // PhysicalObject instances
    const observedObjects: any[] = [];
    const observedSql = "SELECT DISTINCT TargetECInstanceId FROM IoTDevices:SensorObservesElement";
    this.iModelDb.withPreparedStatement(observedSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const observedElementId: Id64String = statement.getValue(0).getId();
        const observedElementProps: ElementProps = this.iModelDb.elements.getElementProps(observedElementId);
        const observedObject = this.createAdtInstance(observedElementProps);
        observedObject.computedHealth = 0.0; // will be populated by the Azure Function on the ADT side
        observedObjects.push(observedObject);
      }
    });

    // Sensor instances
    const iotSimulationId: GuidString = "c210810c-f052-4045-a7ca-aedc8ed699ea";
    const sensorInstances: any[] = [];
    const sensorSql = "SELECT ECInstanceId,TypeDefinition.Id FROM IoTDevices:Sensor ORDER BY ECInstanceId";
    this.iModelDb.withPreparedStatement(sensorSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const sensorId: Id64String = statement.getValue(0).getId();
        const sensorTypeId: Id64String = statement.getValue(1).getId();
        const sensorTypeProps: TypeDefinitionElementProps = this.iModelDb.elements.getElementProps(sensorTypeId);
        const sensorProps: GeometricElement3dProps = this.iModelDb.elements.getElementProps(sensorId);
        const sensorInstance = this.createAdtInstance(sensorProps);
        sensorInstance.type = sensorTypeProps.code.value;
        if (sensorTypeProps.federationGuid && sensorProps?.jsonProperties?.iot?.sensorTypeIndex) {
          sensorInstance.deviceId = `${iotSimulationId}.${sensorTypeProps.federationGuid}.${sensorProps.jsonProperties.iot.sensorTypeIndex}`;
        }
        const observedElementId: Id64String | undefined = this.queryObservedElement(sensorProps.id!);
        if (undefined !== observedElementId) {
          sensorInstance.observes = this.buildElementUrn(observedElementId);
        }
        const observationTypes: ObservationTypeProps[] = this.queryObservationTypes(sensorTypeId);
        if (observationTypes.length > 0) {
          sensorInstance.observationLabel1 = observationTypes[0].code.value;
          sensorInstance.observationUnit1 = observationTypes[0].unit;
          sensorInstance.observationValue1 = 0.0; // will come from IoT Hub
        }
        if (observationTypes.length > 1) {
          sensorInstance.observationLabel2 = observationTypes[1].code.value;
          sensorInstance.observationUnit2 = observationTypes[1].unit;
          sensorInstance.observationValue2 = 0.0; // will come from IoT Hub
        }
        // WIP: only the first two ObservationTypes are supported now
        sensorInstances.push(sensorInstance);
      }
    });
    FileSystemUtils.writeJsonFile(this.outputDir, "adt-instances.json", observedObjects.concat(sensorInstances));
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

  private createAdtInstance(elementProps: ElementProps): any {
    return {
      $dtId: this.buildElementUrn(elementProps.id!),
      $metadata: { $model: this.buildAdtTypeUrn(elementProps.classFullName.split(":")[1]) },
      name: elementProps.code.value,
    };
  }

  private buildAdtTypeUrn(className: string): string {
    const versionNumber = 1; // needs to be incremented each time the schema changes after it has been uploaded to ADT
    return `urn:civil-iot:adt-type:${className}:${versionNumber}`;
  }

  private buildElementUrn(elementId: Id64String): string {
    return `urn:iModel-element:${this.iModelDb.iModelId}#${elementId}`;
  }

  private queryObservedElement(sensorId: Id64String): Id64String | undefined {
    const sql = "SELECT TargetECInstanceId FROM IoTDevices:SensorObservesElement WHERE SourceECInstanceId=:sensorId LIMIT 1";
    return this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String | undefined => {
      statement.bindId("sensorId", sensorId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    });
  }

  private queryObservationTypes(sensorTypeId: Id64String): ObservationTypeProps[] {
    const observationTypes: ObservationTypeProps[] = [];
    const sql = "SELECT TargetECInstanceId FROM IoTDevices:SensorTypeHasObservationTypes WHERE SourceECInstanceId=:sensorTypeId";
    this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindId("sensorTypeId", sensorTypeId);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const observationTypeId: Id64String = statement.getValue(0).getId();
        const observationTypeProps: ObservationTypeProps = this.iModelDb.elements.getElementProps(observationTypeId);
        observationTypes.push(observationTypeProps);
      }
    });
    return observationTypes;
  }
}
