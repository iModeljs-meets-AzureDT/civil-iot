import { IModelHost, IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";
import * as path from "path";
import { SensorImporter } from "./SensorImporter";

async function main(process: NodeJS.Process): Promise<void> {
  try {
    IModelHost.startup();

    const outputDir = path.join(__dirname, "out");
    if (IModelJsFs.existsSync(outputDir)) {
      IModelJsFs.removeSync(outputDir);
    }
    IModelJsFs.mkdirSync(outputDir);

    const iModelFileName = path.join(outputDir, "sensor-sample.bim");
    const iModelDb: SnapshotDb = SnapshotDb.createEmpty(iModelFileName, {
      rootSubject: { name: "Sensor Sample" },
      createClassViews: true,
    });
    const importer = new SensorImporter(iModelDb);
    const iotSchemaFile = path.join(__dirname, "assets", "IoTDevices.ecschema.xml");
    const roadNetworkSchemaFile = path.join(__dirname, "assets", "RoadNetworkComposition.ecschema.xml");
    const inputDataFile = path.join(__dirname, "assets", "sample-input.json");
    await importer.import([iotSchemaFile, roadNetworkSchemaFile], inputDataFile);
    iModelDb.close();

    IModelHost.shutdown();

  } catch (error) {
    process.stdout.write(error.message + "\n" + error.stack);
  }
}

if (require.main === module) { // Invoke main if Main.js is being run directly
  main(process); // tslint:disable-line: no-floating-promises
}
