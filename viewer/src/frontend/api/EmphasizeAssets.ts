/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { EmphasizeElements, Viewport } from "@bentley/imodeljs-frontend";

export class EmphasizeAssets {

  public static emphasize(ids: string[], vp: Viewport) {
    const emph = EmphasizeElements.getOrCreate(vp);
    emph.wantEmphasis = true;
    emph.emphasizeElements(ids, vp);
  }
}
