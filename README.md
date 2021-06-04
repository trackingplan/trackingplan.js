[//]: <> (This file is meant for public user consumption.)

# trackingplan.js

This is the code repository of the Trackingplan JavaScript SDK. If you are interested in other SDKs for a different programming language or platform, please ask the [Trackingplan team](mailto:team@trackingplan.com).

## How it works

Trackingplan works by _listening_ to the requests your code makes to your current analytics services. These requests are asynchronously forwarded to the Trackingplan server, where they are parsed and analyzed looking for changes and potential errors in the received data. No data is returned to the clients (i.e. your user's web browser).

The script uses a sampling mechanism to avoid sending all the generated requests. Only a statistically significant amount of requests are forwarded.

## Installing Trackingplan

### Add the script to your site

Installing Trackingplan is simple. Among others, we support the following methods:
* Just paste the snippet below on top of the `<head>` of your site.
* Use your tag manager to include the script.
* Include the library as an npm package with `npm -i trackingplan-js`.

Once our library is included, initialize it with `Trackingplan.init("YOUR_TP_ID")` to start monitoring.

**Warning: This minified example is only for documentation purposes. Replace it with the latest version provided during signup before distributing.**

```javascript
<script type="text/javascript">
    (function(){function a(){try{q.setItem("_tp_t","a"),q.removeItem("_tp_t")}catch(a){return!1}return!0}function b(){var a=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src").set;Object.defineProperty(HTMLImageElement.prototype,"src",{set:function(b){return e({method:"GET",endpoint:b,protocol:"img"}),a.apply(this,arguments)}});var b=HTMLImageElement.prototype.setAttribute;HTMLImageElement.prototype.setAttribute=function(a,c){return"src"==a.toLowerCase()&&e({method:"GET",endpoint:c,protocol:"img"}),b.apply(this,arguments)}}function c(){var a=t.prototype.open,b=t.prototype.send;t.prototype.open=function(b,c){return this._tpUrl=c,this._tpMethod=b,a.apply(this,arguments)},t.prototype.send=function(a){return e({method:this._tpMethod,endpoint:this._tpUrl,payload:a,protocol:"xhr"}),b.apply(this,arguments)}}function d(){var a=navigator.sendBeacon;navigator.sendBeacon=function(b,c){return e({method:"POST",endpoint:b,payload:c,protocol:"beacon"}),a.apply(this,arguments)}}function e(a){setTimeout(function(){try{var b=n(a.endpoint);if(!b)return;var c=l();return!1===c?(G.push(a),o("Queued, queue length = "+G.length),setTimeout(j,C),!1):g(E,c)?(f(h(a,b,c.sampleRate),y),!0):(o({message:"Request ignored (sampling)",mode:E,dict:c}),!0)}catch(b){p({message:"Trackingplan process error",error:b,request:a})}},0)}function f(a,b){function c(a){var b=A+"?data="+encodeURIComponent(btoa(JSON.stringify(a))),c=document.createElement("img");c.src=b}function d(a){navigator.sendBeacon(A,JSON.stringify(a))}function e(a){var b=new XMLHttpRequest;b.open("POST",A,!0),b.onreadystatechange=function(){if(4===b.readyState)try{o({message:"TP Parsed Track",response:JSON.parse(b.response)})}catch(a){}},b.send(JSON.stringify(a))}o({message:"TP Sent Track",rawEvent:a});"img"===b?c(a):"xhr"===b?e(a):"beacon"===b?d(a):void 0}function g(a,b){switch(a){case"user":return 1===b.isSampledUser;case"track":return Math.random()<1/b.sampleRate;case"all":return!0;case"none":default:return!1;}}function h(a,b,c){return{provider:b,request:{endpoint:a.endpoint,method:a.method,post_payload:a.payload||null},context:{href:r.location.href,hostname:r.location.hostname,user_agent:navigator.userAgent},tp_id:v,source_alias:x,environment:w,sdk:H.sdk,sdk_version:H.sdkVersion,sampling_rate:c,debug:z}}function i(){for(;G.length;){var a=G.shift();e(a)}}function j(){if(!F){var a=new XMLHttpRequest,b=B+"config-"+v+".json";a.onreadystatechange=function(){if(4==this.readyState)try{k(JSON.parse(this.responseText).sample_rate),i()}catch(a){}F=!1},a.open("GET",b,!0),F=!0,a.send()}}function k(a){if(!1===a)return q.removeItem("_trackingplan_sample_rate"),q.removeItem("_trackingplan_sample_rate_ts"),void q.removeItem("_trackingplan_is_sampled_user");var b=Math.random()<1/a?1:0;o("Trackingplan sample rate = "+a+". isSampledUSer "+b),q.setItem("_trackingplan_sample_rate_ts",new Date().getTime()),q.setItem("_trackingplan_sample_rate",a),q.setItem("_trackingplan_is_sampled_user",b)}function l(){var a=q.getItem("_trackingplan_sample_rate_ts");return null!==a&&(parseInt(a)+1e3*D<new Date().getTime()?(o("Trackingplan sample rate expired"),k(!1),!1):{sampleRate:parseInt(q.getItem("_trackingplan_sample_rate")),isSampledUser:parseInt(q.getItem("_trackingplan_is_sampled_user"))})}function m(b,c){for(var d in c)b[d]=c[d];return b}function n(a){for(var b in u)if(-1!==a.indexOf(b))return u[b];return!1}function o(a){z&&s.log(a)}function p(a){r.console&&s.warn&&s.warn(a)}var q=localStorage,r=window,s=console,t=r.XMLHttpRequest;if(r.Trackingplan)return void p("Trackingplan snippet included twice.");var u={"google-analytics.com":"googleanalytics","segment.com":"segment","segment.io":"segment","quantserve.com":"quantserve","intercom.com":"intercom",amplitude:"amplitude",appsflyer:"appsflyer",mixpanel:"mixpanel",kissmetrics:"kissmetrics","hull.io":"hull"},v=null,w="PRODUCTION",x=null,y="xhr",z=!1,A="https://tracks.trackingplan.com/",B="https://config.trackingplan.com/",C=0,D=86400,E="user",F=!1,G=[],H=r.Trackingplan={sdk:"js",sdkVersion:"1.4.1",init:function(e,f){f=f||{};try{if(!a())throw new Error("Not compatible browser");v=e,w=f.environment||w,x=f.sourceAlias||x,y=f.sendMethod||y,u=m(u,f.customDomains||{}),z=f.debug||z,A=f.tracksEndPoint||A,B=f.configEndPoint||B,C=f.delayConfigDownload||C,D=f.sampleRateTTL||D,E=f.samplingMode||E,b(),c(),d(),o({message:"TP init finished with options",options:f})}catch(a){p({message:"TP init error",error:a})}}}})();
    Trackingplan.init("YOUR_TP_ID");
</script>
```

Note that the `init` call above should show your personal Trackingplan ID. Please replace `YOUR_TP_ID` with your personal Trackingplan ID which you will find in your plan's settings page.

As soon as the snippet is deployed on your site, it will start sampling data to create your tracking plan. It does not need to load more scripts from remote servers to start working. Only the sampling rate will be downloaded from our servers.

### Listening

When installed, the Trackingplan SDK attaches a _listener_ to all the remote tracking requests emitted by the analytics provider SDKs. This listener works in the background as non-blocking and, therefore, does not interfere with the original request that the provider's client makes.

The technical procedure for listening to the requests is very simple: The JavaScript methods used to make the requests are wrapped by our code. In this way, when the analytics services use them to send the tracking info, two things happen:
1. First, the original action is performed (i.e. the request is sent to the analytics provider).
2. In a non-blocking manner, and only if the request URL matches with a known analytics services domain, the request is fowarded to our server.

The script listens to the three most typical methods used to communicate with analytics providers:
- XHR: by wrapping the `XMLHttpRequest.open` and `XMLHttpRequest.send` functions
- Pixels: by wrapping the `HTMLImageElement.prototype.setAttribute` function
- Beacons: by wrapping the `navigator.sendBeacon` function

Note that the used implementation is similar to the one used in the actual analytics provider clients, and also employed in the case of browser extensions, testing suites and debugging tools.

### Sampling

Trackingplan does not track every single request your site sends to the analytics providers, but rather performs statistical sampling on the triggered events to provide your plan with traffic frequencies and validate its implementation. This way, your tracking plan is always updated, and you can take advantage of the inconsistencies and errors we may detect.

The sampling rate is different among our clients. We recalculate it every day. We use localStorage to store it with a lifetime of 24 hours. This means that the sampling rate is only downloaded once per day and user. This data cannot be used to track your user in any manner.

Before the _sampling rate_ is downloaded, every request to Trackingplan is queued. That way, all the different events we monitor for you appear at our servers with the same probability.

### Other important details

- The Trackingplan snippet should be added before other analytics snippets.
- The full snippet weights ~3kb compressed.
- You can also use a Tag Manager (e.g. Google Tag Manager) to include the code.
- If your site uses a Content Security Policy (CSP) you will need to:
    - Add `config.trackingplan.com` to your `script-src` policy.
    - Add `tracks.trackingplan.com` to your `connect-src` policy.

### Cookies and local storage

- This script does not use any browser cookie.
- localStore is employed to save the sampling rate mentioned above with the following keys:
   - `_trackingplan_sample_rate_ts`: Timestamp of the last time the sampling rate was downloaded
   - `_trackingplan_sample_rate`: Sampling rate value 
   - `isSampledUser`: Whether sampling is done at user or at event hit level 

### Advanced options

The `init` call can also receive an `options` dictionary, that allows you to set some advanced parameters.

| Parameter     | Description                                                                                                                                                                                                                                                                             | Default value | Example                        |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|--------------------------------|
| `sourceAlias`   | Allows to differentiate between sources | `Javascript` | `IOS App` |
| `environment`   | Allows to isolate the data between production and testing environments | `PRODUCTION`  | `DEV` |
| `customDomains` | Allows to extend the list of monitored domains. Any request made to these domains will also be forwarded to Trackingplan. The format is `[{"myAnalyticsDomain.com", "myAnalytics"}]`, where you put, respectively, the domain to be looked for and the alias you want to use for that analytics domain. | `{}`            | `[{"mixpanel.com", "Mixpanel"}]` |
| `debug`         | Shows Trackingplan debugging information in the console | `false` | `true` |

## License

Released under the [MIT License](LICENSE).
