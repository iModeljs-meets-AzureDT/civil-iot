import * as Msal from "msal";

const AdtAppId = "0b07f429-9f4b-4714-9392-cc5e8e80c8b0";
const TsiAppId = "120d688d-1518-4cf7-bd38-182f158850b6";
const ClientId = "7287aee1-6d2d-419e-a352-03950fa36a69";
const TenantId = "067e9632-ea4c-4ed9-9e6d-e294956e284b";

export class AzureAuth {

  private static msalConfig = {
    auth: {
      clientId: ClientId,
      redirectUri: "http://localhost:3000",
      authority: "https://login.microsoftonline.com/" + TenantId
    }
  };

  public static async initialize() {
    const loginRequest = {
      scopes: ["https://api.timeseries.azure.com//user_impersonation"] // optional Array<string>
    };
    const msalInstance = new Msal.UserAgentApplication(AzureAuth.msalConfig);
    await msalInstance.loginPopup(loginRequest);
  }

  public static async getAdtToken() {
    return this.fetchToken([AdtAppId + "/.default"]);
  }

  public static async getTsiToken() {
    return this.fetchToken([TsiAppId + "/.default"]);
  }

  private static async fetchToken(scopes: any) {

    const msalInstance = new Msal.UserAgentApplication(AzureAuth.msalConfig);
    msalInstance.handleRedirectCallback((_error: any, _response: any) => {
      // handle redirect response or error
    });

    try {
      let accessToken: any;
      // if the user is already logged in you can acquire a token
      if (!msalInstance.getAccount()) AzureAuth.initialize();
      if (msalInstance.getAccount()) {
        const tokenRequest = {scopes};
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
      if (accessToken != null) return accessToken;
    } catch (err) {
      // user is not logged in, you will need to log them in to acquire a token
    }
  }
}
