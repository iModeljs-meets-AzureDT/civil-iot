
import { IModelJsFs } from "@bentley/imodeljs-backend";
import * as path from "path";

export class FileSystemUtils {
  public static prepareFile(dirName: string, fileBaseName: string): string {
    const filePath: string = path.join(dirName, fileBaseName);
    if (IModelJsFs.existsSync(filePath)) {
      IModelJsFs.removeSync(filePath);
    }
    return filePath;
  }
}
