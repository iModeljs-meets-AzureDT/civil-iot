import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import { Exporter } from "./Exporter";

IModelHost.startup();

const iModelFileName = "d:/data/bim/CoffsHarborSnapshot.bim";
const iModelDb: SnapshotDb = SnapshotDb.openFile(iModelFileName);
const exporter = new Exporter(iModelDb);
exporter.exportAll();
iModelDb.close();
