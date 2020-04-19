import * as Msal from "msal";
// keep this id, it identifies the ADT APIs

const AdtAppId = "0b07f429-9f4b-4714-9392-cc5e8e80c8b0";
const ClientId = "7287aee1-6d2d-419e-a352-03950fa36a69";
const TenantId = "067e9632-ea4c-4ed9-9e6d-e294956e284b";


export class AdtDataLink {

  private static _singleton: AdtDataLink;
  public static get() { return AdtDataLink._singleton; }

  private _tokenName = "adtToken";
  public static adtHost = "coffsharbor-twin.api.wcus.digitaltwins.azure.net";

  public static async initialize() {
    if (undefined === AdtDataLink._singleton) {
      AdtDataLink._singleton = new AdtDataLink();
      if (!AdtDataLink.get().getToken())
        await AdtDataLink.get().login();
    }
  }

  public async fetchDataForNode(dtId: string) {
    const request = `http://localhost:3000/digitaltwins/${dtId}?api-version=2020-03-01-preview`;

    const response = await fetch(request, { headers: { Authorization: "Bearer " + this.getToken(), Host: AdtDataLink.adtHost } });
    return response.json();
  }

  public async login() {
    const msalConfig = {
      auth: {
        clientId: ClientId,
        redirectUri: "http://localhost:3000",
        authority: "https://login.microsoftonline.com/" + TenantId
      }
    };

    const msalInstance = new Msal.UserAgentApplication(msalConfig);

    msalInstance.handleRedirectCallback((_error: any, _response: any) => {
      // handle redirect response or error
    });

    const loginRequest = {
      scopes: [AdtAppId + "/.default"] // optional Array<string>
    };

    try {
      await msalInstance.loginPopup(loginRequest)
      let accessToken: any;
      // if the user is already logged in you can acquire a token
      if (msalInstance.getAccount()) {
        const tokenRequest = {
          scopes: [AdtAppId + "/.default"]
        };
        try {
          const response = await msalInstance.acquireTokenSilent(tokenRequest);
          accessToken = response.accessToken;
        } catch (err) {
          // could also check if err instance of InteractionRequiredAuthError if you can import the class.
          if (err.name === "InteractionRequiredAuthError") {
            const response = await msalInstance.acquireTokenPopup(tokenRequest)
            accessToken = response.accessToken;
          }
        }
      }
      if (accessToken != null) this.setToken(accessToken);
    } catch (err) {
      // user is not logged in, you will need to log them in to acquire a token
    }
  }

  public setToken(token: string) {
    document.cookie = this._tokenName + "=" + token;
  }

  public getToken() {
    return this._getCookie(this._tokenName);
  }

  private _getCookie(name: string) {
    const value = "; " + document.cookie;
    const parts = value.split("; " + name + "=");

    if (parts.length === 2) {
      return parts.pop()!.split(";").shift();
    }
    return undefined;
  }
}
