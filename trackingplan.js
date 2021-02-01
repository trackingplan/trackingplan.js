/**
v1.2.3
Usage:
Trackingplan.init("12345");
or
Trackingplan.init("12345", {
    [, sourceAlias: "MyWeb"]
    [, customDomains: {"MyAnalyticsDomain.com", "MyAnalytics"}]
    [, debug: true]
});
**/

(function () {

    if (window.Trackingplan) { // Do not include the script twice.
        if (window.console && console.warn) {
            console.warn('Trackingplan snippet included twice.');
        }
        return;
    }

    var Trackingplan = window.Trackingplan = {
        queue: [],

        sdk: "js",

        sdkVersion: "1.2.3",  // TODO: Reset on launch.

        providerDomains: { // Left side could be turned into regex.
            "google-analytics.com": "googleanalytics",
            "segment.com": "segment",
            "segment.io": "segment",
            "quantserve.com": "quantserve",
            "intercom.com": "intercom",
            "amplitude": "amplitude",
            "appsflyer": "appsflyer",
            "fullstory": "fullstory",
            "mixpanel": "mixpanel",
            "kissmetrics": "kissmetrics",
            "hull.io": "hull",
            "hotjar": "hotjar",
        },

        options: {
            tpId: null,
            environment: "PRODUCTION",
            sourceAlias: null,
            trackingplanMethod: "xhr",
            customDomains: {},
            debug: false,
            trackingplanEndpoint: "https://tracks.trackingplan.com/", // Can be overwritten.
            trackingplanConfigEndpoint: "https://config.trackingplan.com/", // Can be overwritten.
            delayConfigDownload: 5, // For testing queue and sync purposes.
            ignoreSampling: false, // For testing purposes.
        },



        init: function (tpId, options) {
            try {
                if(options === undefined){
                    options = {};
                }

              	function _merge_objects(o1, o2){
          			for (var a in o2) { o1[a] = o2[a]; }
          			return o1;
        		}

              	Trackingplan.options['tpId'] = tpId;
              	Trackingplan.options = _merge_objects(Trackingplan.options, options);
    			Trackingplan.providerDomains = _merge_objects(Trackingplan.providerDomains,Trackingplan.options.customDomains);
                Trackingplan.installImageInterceptor();
                Trackingplan.installXHRInterceptor();
                Trackingplan.installBeaconInterceptor();

                if (!Trackingplan.getSampleRate()) {
                    setTimeout(Trackingplan.downloadSampleRate, Trackingplan.options.delayConfigDownload);
                }

                Trackingplan.options.debug && console.log("TP init finished with options", options);
            } catch (error) {
                console.warn("TP init error ", error);
            }

        },

        installImageInterceptor: function () { // Intercepts DOM an Image .src and .setAttribute().
            var setsrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src").set; // Copies original .src behaviour.
            Object.defineProperty(HTMLImageElement.prototype, "src", {
                set: function (url) {
                    Trackingplan.processRequest({ "method": "GET", "endpoint": url, "protocol": "img" }); // If we want to block, this could be an "if".
                    return setsrc.apply(this, arguments); // Does what original .src does.
                }
            });

            var setAttribute = HTMLImageElement.prototype.setAttribute; // Copies original img.setAtribute behaviour.
            HTMLImageElement.prototype.setAttribute = function (key, value) {
                if (key.toLowerCase() == "src") {
                    Trackingplan.processRequest({ "endpoint": value, "protocol": "img" });
                }
                return setAttribute.apply(this, arguments); // Does what original .setAttribute does.
            }
        },

        installXHRInterceptor: function () { // Intercepts XHR.
            var open = window.XMLHttpRequest.prototype.open; // Copies XHR.open original behaviour.
            var send = window.XMLHttpRequest.prototype.send; // Copies XHR.send original behaviour.

            window.XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
                this._trackingplanUrl = url;
                this._trackingplanMethod = method;
                return open.apply(this, arguments); // Does what original .open does (create request).
            }

            window.XMLHttpRequest.prototype.send = function (data) {
                Trackingplan.processRequest({ "method": this._trackingplanMethod, "endpoint": this._trackingplanUrl, "payload": data, "protocol": "xhr" });
                return send.apply(this, arguments); // Does what original .send does.
            }
        },

        installBeaconInterceptor: function () { // Intercepts Navigator.sendBeacon.
            var sendBeacon = navigator.sendBeacon; // Copies original sendBeacon behaviour.
            navigator.sendBeacon = function (url, data) {
                Trackingplan.processRequest({ "method": "POST", "endpoint": url, "payload": data, "protocol": "beacon" });
                return sendBeacon.apply(this, arguments); // Default navigator.sendBeacon
            }
        },

        processRequest: function (request) { // Decides whether or not send to trackingplan and applies data transform.
            setTimeout(function(){ // makes function non-blocking
                try {
                    function getAnalyticsProvider(endpoint) {
                        var matches = endpoint.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
                        var hostname = matches && matches[1]; // Domain will be null if no match is found.
                        if (!hostname) return false;
                        for (var domain in Trackingplan.providerDomains) {
                            if (Trackingplan.providerDomains.hasOwnProperty(domain) && hostname.indexOf(domain) !== -1) return Trackingplan.providerDomains[domain];
                        }
                        return false;
                    }

                    var provider = getAnalyticsProvider(request.endpoint);
                    if (!provider) return;


                    var sampleRate = Trackingplan.getSampleRate();
                    if (!sampleRate) { // here is where we queue if we still dont have the user config downloaded.
                        Trackingplan.queue.push(request);
                        return false;
                    }

                    if (!Trackingplan.options.ignoreSampling && Math.random() >= (1 / sampleRate)) { // rolling the sampling dice
                        return true;
                    }

                    Trackingplan.sendDataToTrackingplan(Trackingplan.createRawTrack(request, provider, sampleRate), Trackingplan.options.trackingplanMethod);
                    return true;
                } catch (error) {
                    console.warn("Trackingplan process error ", error, request);
                }
            }, 0);
        },

        createRawTrack: function (request, provider, sampleRate) {
            return {
                // Normalized provider name (extracted from domain/regex => provider hash table).
                "provider": provider,

                "request": {
                    // The original provider endpoint URL
                    "endpoint": request.endpoint,
                    // The request method. It’s not just POST & GET, but the info needed to inform the parsers how to decode the payload within that provider, e.g. Beacon.
                    "method": request.method,
                    // The payload, in its original form. If it’s a POST request, the raw payload, if it’s a GET, the querystring (are there other ways?).
                    "post_payload": request.payload || null,
                },
                "context": {
                    "href": window.location.href,
                    "hostname": window.location.hostname,
                    "user_agent": navigator.userAgent
                    // Information that is extracted in run time that can be useful. IE. UserAgent, URL, etc. it varies depending on the platform. Can we standardize it?
                },
                // A key that identifies the customer. It’s written by the developer on the SDK initialization.
                "tp_id": Trackingplan.options.tpId,
                // An optional alias that identifies the source. It’s written by the developer on the SDK initialization.
                "source_alias": Trackingplan.options.sourceAlias,
                // An optional environment. It’s written by the developer on the SDK initialization. Useful for the developer testing. Can be "PRODUCTION" or "TESTING".
                "environment": Trackingplan.options.environment,
                // The used sdk. It’s known by the sdk itself.
                "sdk": Trackingplan.sdk,
                // The SDK version, useful for implementing different parsing strategies. It’s known by the sdk itself.
                "sdk_version": Trackingplan.sdkVersion,
                // The rate at which this specific track has been sampled.
                "sampling_rate": sampleRate,
                // Debug mode. Makes every request return and console.log the parsed track.
                "debug": Trackingplan.options.debug
            }

        },

        sendDataToTrackingplan: function (trackingplanRawEvent, method) { // Example with cloudfront approach.
            Trackingplan.options.debug && console.log("TP Sent Track", trackingplanRawEvent);

            function sendDataToTrackingplanWithIMG(trackingplanRawEvent) {
                var pixel_url = Trackingplan.trackingplanEndpoint + "?data=" + encodeURIComponent(btoa(JSON.stringify(trackingplanRawEvent)));
                var element = document.createElement("img");
                element.src = pixel_url;
            }

            function sendDataToTrackingplanWithBeacon(trackingplanRawEvent) {
                navigator.sendBeacon(Trackingplan.options.trackingplanEndpoint, JSON.stringify(trackingplanRawEvent));
            }

            function sendDataToTrackingplanWithXHR(trackingplanRawEvent, callback) {
                var xhr = new XMLHttpRequest();
                xhr.open("POST", Trackingplan.options.trackingplanEndpoint, true);
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        try {
                            Trackingplan.options.debug && console.log("TP Parsed Track", JSON.parse(xhr.response));
                        } catch (error){};
                    }
                  }
                xhr.send(JSON.stringify(trackingplanRawEvent));
            }

            switch (method) {
                case "img":
                    sendDataToTrackingplanWithIMG(trackingplanRawEvent);
                    break;
                case "xhr":
                    sendDataToTrackingplanWithXHR(trackingplanRawEvent);
                    break;
                case "beacon":
                    sendDataToTrackingplanWithBeacon(trackingplanRawEvent);
                    break;
            }
        },

        processQueue: function () { // Process all requests waiting in the queue.
            while (Trackingplan.queue.length) {
                var request = Trackingplan.queue.shift();
                Trackingplan.processRequest(request);
            }
        },

        sampleRateCookieName: "_trackingplan_sample_rate",
        sampleRateCookieDays: 1,

        getSampleRate: function () { // Reads the sample rate from cookie.
            var b = document.cookie.match('(^|[^;]+)\\s*' + Trackingplan.sampleRateCookieName + '\\s*=\\s*([^;]+)');
            return b ? b.pop() : '';
        },

        setSampleRate: function (rate) { // Sets the sample rate at the cookie. Set to '' to invalidate.
            var date = new Date();
            date.setTime(date.getTime() + (Trackingplan.sampleRateCookieDays * 24 * 60 * 60 * 1000));
            var expires = "; expires=" + date.toGMTString();
            document.cookie = Trackingplan.sampleRateCookieName + "=" + rate + expires + "; path=/";
        },

        downloadSampleRate: function () { // Includes the script that sets the cookie.
            var head = document.head;
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.async = true;
            script.crossorigin = "anonymous";
            script.src = Trackingplan.options.trackingplanConfigEndpoint + "config-" + Trackingplan.options.tpId + ".js";
            head.appendChild(script);
        }
    }
})();