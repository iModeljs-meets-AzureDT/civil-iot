import { AzureAuth } from "./AzureToken";

export class AdtDataLink {

  public static adtHost = "coffsharbor-twin.api.wcus.digitaltwins.azure.net";

  public static async fetchDataForNode(dtId: string) {
    const request = `http://localhost:3000/digitaltwins/${dtId}?api-version=2020-03-01-preview`;

    const response = await fetch(request, { headers: { Authorization: "Bearer " + await AzureAuth.getAdtToken(), Host: AdtDataLink.adtHost } });
    return response.json();
  }
}
