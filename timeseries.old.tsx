import TsiClient from "tsiclient";
import * as Msal from "msal";

const EnvironmentFqdn = "5d9c572a-aa3f-43c4-b3a7-a6e0ba79eb71.env.timeseries.azure.com";
const AadClientApplicationId = "7287aee1-6d2d-419e-a352-03950fa36a69";
const AadScopes = ["https://api.timeseries.azure.com//user_impersonation"];
const AadRedirectUri = "http://localhost:3000/";
const AadTenantName = "067e9632-ea4c-4ed9-9e6d-e294956e284b";
const AadAuthenticationAuthority = "https://login.microsoftonline.com/"  + AadTenantName

export class TimeSeries {

  private tsiClient = new TsiClient();

  public async login() {
    const msalConfig = {
      auth: {
        clientId: AadClientApplicationId,
        redirectUri: AadRedirectUri,
        authority: AadAuthenticationAuthority
      }
    };

    const msalInstance = new Msal.UserAgentApplication(msalConfig);

    msalInstance.handleRedirectCallback((_error: any, _response: any) => {
      // handle redirect response or error
    });

    var loginRequest = {
      scopes: AadScopes // optional Array<string>
    };

    try {
      var accessToken;
      // if the user is already logged in you can acquire a token
      if (msalInstance.getAccount()) {
        var tokenRequest = {
          scopes: ["120d688d-1518-4cf7-bd38-182f158850b6" + "/.default"]
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
      else {
        await msalInstance.loginPopup(loginRequest);
      }
      if (accessToken != null) return accessToken;
    } catch (err) {
      // user is not logged in, you will need to log them in to acquire a token
    }
  }

  public async showTsiDataForNode(accessToken: string, dtId: string) {
    const aggregateExpressions: any[] = [];
    const now = new Date();
    // var endDate = new Date(now.valueOf() - 1000*60*60*15);
    var startDate = new Date(now.valueOf() - 1000*60*60*1);

    aggregateExpressions.push(
      new this.tsiClient.ux.AggregateExpression(
        {predicateString: `[cloudEvents:subject].String = '${dtId}'`},
        {property: 'patch.value', type: "Double"},
        ['avg', 'min', 'max'],
        { from: startDate, to: now, bucketSize: '1m' },
        null,  // split by property
        {color: 'pink', includeEnvelope: true, alias: dtId}));

    const result = await this.tsiClient.server.getAggregates(accessToken, EnvironmentFqdn, aggregateExpressions.map(function(ae){return ae.toTsx()}));
    if (result[0] && result[0].measures.length > 0) this.displayTsiGraph(result, aggregateExpressions);
  }

  private displayTsiGraph(result: any, aggregateExpressions: any) {
    var transformedResult = this.tsiClient.ux.transformAggregatesForVisualization(result, aggregateExpressions);
    const diagram = document.getElementById('diagramDIV');
    var lineChart = this.tsiClient.ux.LineChart(diagram);
    lineChart.render(transformedResult, {theme: 'light', legend: 'compact',  grid: true, tooltip: true}, aggregateExpressions);
  }

  private triggerResize(timeoutMillis: number) {
    let resizeEvent = window.document.createEvent('UIEvents');
    (resizeEvent as any).initUIEvent('resize', true, false, window, 0);
    setTimeout(() => {window.dispatchEvent(resizeEvent); }, timeoutMillis);
  }
}
