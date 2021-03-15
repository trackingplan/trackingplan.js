/**
v1.4.1

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

    // Needed to avoid repeating global variables after minimization
    var tpStorage = localStorage;
    var tpWindow = window;
    var tpConsole = console;
    var TpXMLHttpRequest = tpWindow.XMLHttpRequest;

    // Do not include the script twice.
    if (tpWindow.Trackingplan) {
        consoleWarn('Trackingplan snippet included twice.');
        return;
    }

    // Left side could be turned into regex.
    var _providerDomains = {
        "google-analytics.com": "googleanalytics",
        "segment.com": "segment",
        "segment.io": "segment",
        "quantserve.com": "quantserve",
        "intercom.com": "intercom",
        "amplitude": "amplitude",
        "appsflyer": "appsflyer",
        "mixpanel": "mixpanel",
        "kissmetrics": "kissmetrics",
        "hull.io": "hull"
    }

    var _tpId = null;

    //
    // Start of options
    //

    var _environment = "PRODUCTION";

    var _sourceAlias = null;

    // Method to send hits to tracksEndpoint
    var _sendMethod = "xhr";

    var _debug = false;

    var _tracksEndPoint = "https://tracks.trackingplan.com/";

    var _configEndPoint = "https://config.trackingplan.com/";

    // For testing queue and sync purposes.
    var _delayConfigDownload = 0;

    // Sample Rate Time To Live in seconds
    var _sampleRateTTL = 86400;

    // Sampling mode:
    //   user - Per user,
    //   track - per track,
    //   all - send all tracks (debug),
    //   none: block all (debug)
    var _samplingMode = "user";

    //
    // End of options
    //

    var _sampleRateKey = "_trackingplan_sample_rate";
    var _sampleRateTSKey = "_trackingplan_sample_rate_ts";
    var _isSampledUserKey = "_trackingplan_is_sampled_user";
    var _sampleRateDownloading = false;

    var _queue = [];

    var Trackingplan = tpWindow.Trackingplan = {

        sdk: "js",

        sdkVersion: "1.4.1",  // TODO: Reset on launch.

        /**
         * Default options:
         * {
         *      environment: "PRODUCTION",
         *      sourceAlias: null,
         *      sendMethod: "xhr",
         *      customDomains: {},
         *      debug: false,
         *      tracksEndpoint: "https://tracks.trackingplan.com/",
         *      configEndpoint: "https://config.trackingplan.com/",
         *      delayConfigDownload: 0,
         *      sampleRateTTL: 86400,
         *      samplingMode: "user"
         * }
         */
        init: function (tpId, options) {
            options = options || {};
            try {
                if (!testCompat()) throw new Error("Not compatible browser");



                _tpId = tpId;
                _environment = options.environment || _environment;
                _sourceAlias = options.sourceAlias || _sourceAlias;
                _sendMethod = options.sendMethod || _sendMethod;
                _providerDomains = _merge_objects(_providerDomains, options.customDomains || {});
                _debug = options.debug || _debug;
                _tracksEndPoint = options.tracksEndPoint || _tracksEndPoint;
                _configEndPoint = options.configEndPoint || _configEndPoint;
                _delayConfigDownload = options.delayConfigDownload || _delayConfigDownload;
                _sampleRateTTL = options.sampleRateTTL || _sampleRateTTL;
                _samplingMode = options.samplingMode || _samplingMode;

                installImageInterceptor();
                installXHRInterceptor();
                installBeaconInterceptor();

                debugLog({message: "TP init finished with options", options: options});
            } catch (error) {
                consoleWarn({message: "TP init error", error: error});
            }
        }
    }

    function testCompat() {
        // Test localStorage
        try {
            tpStorage.setItem("_tp_t", "a");
            tpStorage.removeItem("_tp_t");
        } catch (e) {
            return false;
        }
        return true;
    }

    // Intercepts DOM an Image .src and .setAttribute().
    function installImageInterceptor() {

        var setsrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src").set; // Copies original .src behaviour.

        Object.defineProperty(HTMLImageElement.prototype, "src", {
            set: function (url) {
                processRequest({ "method": "GET", "endpoint": url, "protocol": "img" }); // If we want to block, this could be an "if".
                return setsrc.apply(this, arguments); // Does what original .src does.
            }
        });

        var setAttribute = HTMLImageElement.prototype.setAttribute; // Copies original img.setAtribute behaviour.
        HTMLImageElement.prototype.setAttribute = function (key, value) {
            if (key.toLowerCase() == "src") {
                processRequest({ "method": "GET", "endpoint": value, "protocol": "img" });
            }
            return setAttribute.apply(this, arguments); // Does what original .setAttribute does.
        }
    }

    // Intercepts XHR.
    function installXHRInterceptor() {
        var open = TpXMLHttpRequest.prototype.open; // Copies XHR.open original behaviour.
        var send = TpXMLHttpRequest.prototype.send; // Copies XHR.send original behaviour.

        TpXMLHttpRequest.prototype.open = function (method, url, async, user, password) {
            this._tpUrl = url;
            this._tpMethod = method;
            return open.apply(this, arguments); // Does what original .open does (create request).
        }

        TpXMLHttpRequest.prototype.send = function (data) {
            processRequest({ "method": this._tpMethod, "endpoint": this._tpUrl, "payload": data, "protocol": "xhr" });
            return send.apply(this, arguments); // Does what original .send does.
        }
    }

    // Intercepts Navigator.sendBeacon.
    function installBeaconInterceptor() {
        var sendBeacon = navigator.sendBeacon; // Copies original sendBeacon behaviour.
        navigator.sendBeacon = function (url, data) {
            processRequest({ "method": "POST", "endpoint": url, "payload": data, "protocol": "beacon" });
            return sendBeacon.apply(this, arguments); // Default navigator.sendBeacon
        }
    }

    // Decides whether or not send to trackingplan and applies data transform.
    function processRequest(request) {
        setTimeout(function () { // makes function non-blocking
            try {


                var provider = getAnalyticsProvider(request.endpoint);
                if (!provider) return;

                var sampleRateDict = getSampleRateDict()
                if (sampleRateDict === false) { // here is where we queue if we still dont have the user config downloaded.
                    _queue.push(request);
                    debugLog("Queued, queue length = " + _queue.length)
                    setTimeout(downloadSampleRate, _delayConfigDownload);
                    return false;
                }

                if (!shouldProcessRequest(_samplingMode, sampleRateDict)) {
                    debugLog({message: "Request ignored (sampling)", mode: _samplingMode, dict: sampleRateDict});
                    return true;
                }

                sendDataToTrackingplan(createRawTrack(request, provider, sampleRateDict["sampleRate"]), _sendMethod);
                return true;
            } catch (error) {
                consoleWarn({message: "Trackingplan process error", error: error, request: request});
            }
        }, 0);
    }

    // Example with cloudfront approach.
    function sendDataToTrackingplan(trackingplanRawEvent, method) {
        debugLog({message: "TP Sent Track", rawEvent: trackingplanRawEvent});

        function sendDataToTrackingplanWithIMG(trackingplanRawEvent) {
            var pixel_url = _tracksEndPoint + "?data=" + encodeURIComponent(btoa(JSON.stringify(trackingplanRawEvent)));
            var element = document.createElement("img");
            element.src = pixel_url;
        }

        function sendDataToTrackingplanWithBeacon(trackingplanRawEvent) {
            navigator.sendBeacon(_tracksEndPoint, JSON.stringify(trackingplanRawEvent));
        }

        function sendDataToTrackingplanWithXHR(trackingplanRawEvent, callback) {
            var xhr = new XMLHttpRequest();
            xhr.open("POST", _tracksEndPoint, true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    try {
                        debugLog({message: "TP Parsed Track", response: JSON.parse(xhr.response)});
                    } catch (error) { };
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
    }

    function shouldProcessRequest(samplingMode, sampleRateDict) {
        switch (samplingMode) {
            case "user":
                return sampleRateDict["isSampledUser"] === 1;
            case "track":
                return Math.random() < (1 / sampleRateDict["sampleRate"]);
            case "all":
                return true;
            case "none":
            default: // we need a valid sampling mode
                return false;
        }
    }

    function createRawTrack(request, provider, sampleRate) {
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
                "href": tpWindow.location.href,
                "hostname": tpWindow.location.hostname,
                "user_agent": navigator.userAgent
                // Information that is extracted in run time that can be useful. IE. UserAgent, URL, etc. it varies depending on the platform. Can we standardize it?
            },
            // A key that identifies the customer. It’s written by the developer on the SDK initialization.
            "tp_id": _tpId,
            // An optional alias that identifies the source. It’s written by the developer on the SDK initialization.
            "source_alias": _sourceAlias,
            // An optional environment. It’s written by the developer on the SDK initialization. Useful for the developer testing. Can be "PRODUCTION" or "TESTING".
            "environment": _environment,
            // The used sdk. It’s known by the sdk itself.
            "sdk": Trackingplan.sdk,
            // The SDK version, useful for implementing different parsing strategies. It’s known by the sdk itself.
            "sdk_version": Trackingplan.sdkVersion,
            // The rate at which this specific track has been sampled.
            "sampling_rate": sampleRate,
            // Debug mode. Makes every request return and console.log the parsed track.
            "debug": _debug
        }
    }

    // Process all requests waiting in the queue.
    function processQueue() {
        while (_queue.length) {
            var request = _queue.shift();
            processRequest(request);
        }
    }

    function downloadSampleRate() {

        if (_sampleRateDownloading) return

        var xmlhttp = new XMLHttpRequest();
        var url = _configEndPoint + "config-" + _tpId + ".json";
        xmlhttp.onreadystatechange = function () {
            if (this.readyState == 4) {
                try {
                    setSampleRate(JSON.parse(this.responseText)["sample_rate"]);
                    processQueue();
                } catch (error) { };
            }
            _sampleRateDownloading = false;
        };
        xmlhttp.open("GET", url, true);
        _sampleRateDownloading = true;
        xmlhttp.send();
    }

    // Sets the sample rate at the cookie. Set to false to invalidate.
    function setSampleRate(rate) {

        if (rate === false) {
            tpStorage.removeItem(_sampleRateKey)
            tpStorage.removeItem(_sampleRateTSKey)
            tpStorage.removeItem(_isSampledUserKey)
            return
        }
        var isSampledUser = Math.random() < (1 / rate) ? 1 : 0; // rolling the sampling dice

        debugLog("Trackingplan sample rate = " + rate + ". isSampledUSer " + isSampledUser)
        tpStorage.setItem(_sampleRateTSKey, new Date().getTime())
        tpStorage.setItem(_sampleRateKey, rate)
        tpStorage.setItem(_isSampledUserKey, isSampledUser)
    }

    // Reads the sample rate from localstorage.
    function getSampleRateDict() {
        var ts = tpStorage.getItem(_sampleRateTSKey);
        if (ts === null) return false;

        if ((parseInt(ts) + _sampleRateTTL * 1000) < new Date().getTime()) { // expired
            debugLog("Trackingplan sample rate expired");
            setSampleRate(false);
            return false;
        } else {
            return {
                "sampleRate": parseInt(tpStorage.getItem(_sampleRateKey)),
                "isSampledUser": parseInt(tpStorage.getItem(_isSampledUserKey))
            }
        }
    }


    function _merge_objects(o1, o2) {
        for (var a in o2) { o1[a] = o2[a]; }
        return o1;
    }


    function getAnalyticsProvider(endpoint) {
        for (var domain in _providerDomains) {
            if (endpoint.indexOf(domain) !== -1) return _providerDomains[domain];
        }
        return false;
    }


    function debugLog(message) {
        _debug && tpConsole.log(message);
    }


    function consoleWarn(message) {
        tpWindow.console && tpConsole.warn && tpConsole.warn(message);
    }
})();