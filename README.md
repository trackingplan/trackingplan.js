[//]: <> (This file is meant for public user consumption.)

# trackingplan.js

## How it works

Trackingplan works by _listening_ to the requests your JS code makes to your current analytics services. These requests are asynchronously forwarded to the Trackingplan server, where they are parsed and analyzed looking for changes and potential errors in the sent data. No data is returned to the clients (i.e. your user's web browser).

The script uses a sampling mechanism to avoid sending all the generated requests. Instead, only a statistically significant amount of requests are forwarded.

### Listening

When installed, the Trackingplan SDK attaches a _listener_ to all the remote tracking requests emitted by the analytics providers. This listener works in the background as non-blocking and, therefore, does not interfere with the original request that the provider's client makes.

The technical procedure for listening to the requests is very simple: The JavaScript methods used to make the requests are wrapped by our code. In this way, when the analytics services use them to send the tracking info, two things happen:
1. The original action is done (i.e. the request is sent to the analytics provider)
2. In a non-blocking manner, and only if the request URL matches with a known analytics services domain, the Trackingplan payload is composed and sent to our server.

The script listens to the three most typical methods used to communicate with analytics providers:
- XHR: by wrapping the `XMLHttpRequest.open` and `XMLHttpRequest.send` functions
- Pixels: by wrapping the `HTMLImageElement.prototype.setAttribute` function
- Beacons: by wrapping the `navigator.sendBeacon` function

Note that the used implementation is similar to the actual analytics provider clients, and also employed in the case of browser extensions, testing suites and debugging tools.


### Sampling

Trackingplan does not track every single request your site sends to the analytics providers, but rather performs statistical sampling on the triggered events to provide your plan with traffic frequencies and validate its implementation. This way, your tracking plan is always updated, and you can take advantage of the inconsistencies and errors we may detect.

The sampling rate is different among our clients. We recalculate it every day. We use locaStorage to store it with a lifetime of 24 hours. This means that the sampling rate is only downloaded once per day and user. This data cannot be used to track your user in any manner.

Before the _sampling rate_ is downloaded, every request to Trackingplan is queued. That way, all the different events we monitor for you appear at our servers with the same probability.

## Installing Trackingplan

### Add the script to your site

Installing Trackingplan is simple, just paste this snippet high in the `<head>` of your site:

**Warning: This minified example is only for demo purposes. Replace it with the latest version before distributing.**

```javascript
<script type="text/javascript">
(function(){if(Trackingplan){if(window.console&&console.error){console.error('Trackingplan snippet included twice.');} return;} var Trackingplan=window.Trackingplan={queue:[],sdk:"js",sdkVersion:"1.0.0",providerDomains:{"google-analytics.com":"googleanalytics","segment.com":"segment","segment.io":"segment","quantserve.com":"quantserve","intercom.com":"intercom","amplitude":"amplitude","appsflyer":"appsflyer","fullstory":"fullstory","mixpanel":"mixpanel","kissmetrics":"kissmetrics","hull.io":"hull","hotjar":"hotjar"},options:{tpId:null,environment:"PRODUCTION",sourceAlias:null,trackingplanMethod:"xhr",debug:false,trackingplanEndpoint:"https://tracks.trackingplan.io",trackingplanConfigEndpoint:"https://config.trackingplan.io/",delayConfigDownload:10,ignoreSampling:false,},init:function(options){try{options=typeof options=='string'?{tpId:options}:options;Object.assign(Trackingplan.options,options);Trackingplan.options.debug&&console.log(Trackingplan.options);Trackingplan.installImageInterceptor();Trackingplan.installXHRInterceptor();Trackingplan.installBeaconInterceptor();if(!Trackingplan.getSampleRate()){setTimeout(Trackingplan.downloadSampleRate,Trackingplan.options.delayConfigDownload);} Trackingplan.options.debug&&console.log("trackingplan init finished");}catch(error){console.log("Trackingplan init error: ",error);}},installImageInterceptor:function(){var setsrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src").set; Object.defineProperty(HTMLImageElement.prototype,"src",{set:function(url){Trackingplan.processRequest({"method":"GET","endpoint":url,"protocol":"img"});return setsrc.apply(this,arguments);}});var setAttribute=HTMLImageElement.prototype.setAttribute;HTMLImageElement.prototype.setAttribute=function(key,value){if(key.toLowerCase()=="src"){Trackingplan.processRequest({"endpoint":value,"protocol":"img"});} return setAttribute.apply(this,arguments);}},installXHRInterceptor:function(){var open=window.XMLHttpRequest.prototype.open;var send=window.XMLHttpRequest.prototype.send;window.XMLHttpRequest.prototype.open=function(method,url,async,user,password){this._trackingplanUrl=url;this._trackingplanMethod=method;return open.apply(this,arguments);}; window.XMLHttpRequest.prototype.send=function(data){Trackingplan.processRequest({"method":this._trackingplanMethod,"endpoint":this._trackingplanUrl,"payload":data,"protocol":"xhr"});return send.apply(this,arguments);}},installBeaconInterceptor:function(){var sendBeacon=navigator.sendBeacon;navigator.sendBeacon=function(url,data){Trackingplan.processRequest({"method":"POST","endpoint":url,"payload":data,"protocol":"beacon"});return sendBeacon.apply(this,arguments);}},processRequest:function(request){try{function getAnalyticsProvider(endpoint){var matches=endpoint.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);var hostname=matches&&matches[1];if(!hostname)return false;for(var domain in Trackingplan.providerDomains){if(Trackingplan.providerDomains.hasOwnProperty(domain)&&hostname.indexOf(domain)!==-1)return Trackingplan.providerDomains[domain];}; return false;}; var provider=getAnalyticsProvider(request.endpoint);if(!provider)return;var sampleRate=Trackingplan.getSampleRate();if(!sampleRate){Trackingplan.queue.push(request);Trackingplan.options.debug&&console.log("queue size "+Trackingplan.queue.length);return false;}; if(!Trackingplan.options.ignoreSampling&&Math.random()>=(1 / sampleRate)){Trackingplan.options.debug&&console.log("bad luck request");return true;}; Trackingplan.sendDataToTrackingplan(Trackingplan.createRawTrack(request,provider),Trackingplan.options.trackingplanMethod);return true;}catch(error){console.error("Trackingplan process error",error,request);}},createRawTrack:function(request,provider){return{"provider":provider,"request":{"endpoint":request.endpoint,"method":request.method,"post_payload":request.payload||null,},"context":{"href":window.location.href,"hostname":window.location.hostname,"user_agent":navigator.userAgent},"tp_id":Trackingplan.options.tpId,"source_alias":Trackingplan.options.sourceAlias,"environment":Trackingplan.options.environment,"sdk":Trackingplan.sdk,"sdk_version":Trackingplan.sdkVersion}},sendDataToTrackingplan:function(trackingplanRawEvent,method){Trackingplan.options.debug&&console.log(trackingplanRawEvent);function sendDataToTrackingplanWithIMG(trackingplanRawEvent){var pixel_url=Trackingplan.trackingplanEndpoint+"?data="+encodeURIComponent(btoa(JSON.stringify(trackingplanRawEvent)));Trackingplan.options.debug&&console.log(pixel_url);var element=document.createElement("img");element.src=pixel_url;}; function sendDataToTrackingplanWithBeacon(trackingplanRawEvent){navigator.sendBeacon(Trackingplan.options.trackingplanEndpoint,JSON.stringify(trackingplanRawEvent));}; function sendDataToTrackingplanWithXHR(trackingplanRawEvent,callback){var xhr=new XMLHttpRequest();xhr.open("POST",Trackingplan.options.trackingplanEndpoint,true);xhr.send(JSON.stringify(trackingplanRawEvent));}; switch(method){case"img":sendDataToTrackingplanWithIMG(trackingplanRawEvent);break;case"xhr":sendDataToTrackingplanWithXHR(trackingplanRawEvent);break;case"beacon":sendDataToTrackingplanWithBeacon(trackingplanRawEvent);break;}},processQueue:function(){while(Trackingplan.queue.length){Trackingplan.options.debug&&console.log("queue shift "+Trackingplan.queue.length);var request=Trackingplan.queue.shift();Trackingplan.processRequest(request);}},sampleRateCookieName:"_trackingplan_sample_rate",sampleRateCookieDays:1,getSampleRate:function(){var b=document.cookie.match('(^|[^;]+)\\s*'+Trackingplan.sampleRateCookieName+'\\s*=\\s*([^;]+)');return b?b.pop():'';},setSampleRate:function(rate){var date=new Date();date.setTime(date.getTime()+(Trackingplan.sampleRateCookieDays*24*60*60*1000));var expires="; expires="+date.toGMTString();document.cookie=Trackingplan.sampleRateCookieName+"="+rate+expires+"; path=/";},downloadSampleRate:function(){var head=document.head;var script=document.createElement('script');script.type='text/javascript';script.async=true;script.crossorigin="anonymous";script.src=Trackingplan.options.trackingplanConfigEndpoint+"config-"+Trackingplan.options.tpId+".js";head.appendChild(script);}}

Trackingplan.init("YOUR_TP_ID");
})();
</script>
```

Note that the `init` call above should show your personal Trackingplan ID if logged in, otherwise, please replace `YOUR_TP_ID` with your personal Trackingplan ID which you will find in your plan's settings page.

As soon as the snippet is deployed on your site, it will start sampling data to create your tracking plan. It does not need to load more scripts from remote servers to start working. Only the sampling rate will be downloaded from our servers.

### Other details

- The Trackingplan snippet should be added before other analytics snippets.
- The full snippet weights ~3kb compressed.
- You can also use a Tag Manager to include the code.
- If your site uses a Content Security Policy (CSP) you will need to:
    - Add `config.trackingplan.com` to your `script-src` policy.
    - Add `tracks.trackingplan.com` to your `connect-src` policy.

### Advanced options

The `init` call can also receive an `options` dictionary, that allows you to set some advanced parameters.

| Parameter     | Description                                                                                                                                                                                                                                                                             | Default value | Example                        |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|--------------------------------|
| `sourceAlias`   | Allows to differentiate between sources                                                                                                                                                                                                                                                 | `"Javascript"`  | `"IOS App"`                      |
| `customDomains` | Allows to extend the list of monitored domains. Any request made to these domains will also be forwarded to Trackingplan. The format is `[{"myAnalyticsDomain.com", "myAnalytics"}]`, where you put, respectively, the domain to be looked for and the alias you want to use for that analytics domain. | `{}`            | `[{"mixpanel.com", "Mixpanel"}]` |
| `debug`         | Shows Trackingplan debugging information in the console                                                                                                                                                                                                                                 | `false`         | `true`                           |

## License

Released under the [MIT license](LICENSE).