/**
v1.5.2

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
        "analytics.google.com": "googleanalytics",
        "api.segment.io": "segment",
        "api.segment.com": "segment",
        "quantserve.com": "quantserve",
        "api.intercom.io": "intercom",
        "api.amplitude.com": "amplitude",
        "ping.chartbeat.net": "chartbeat",
        "api.mixpanel.com": "mixpanel",
        "kissmetrics.com": "kissmetrics",
        "sb.scorecardresearch.com": "scorecardresearch"
    }

    var _tpId = null;

    //
    // Start of options
    //

    var _environment = "PRODUCTION";

    var _sourceAlias = null;

    // Method to send hits to tracksEndpoint.
    var _sendMethod = "xhr";

    var _debug = false;

    // Remember the trailing slash
    var _tracksEndPoint = "https://tracks.trackingplan.com/v1/";

    var _configEndPoint = "https://config.trackingplan.com/";

    // For testing queue and sync purposes.
    var _delayConfigDownload = 0;

    // Sample Rate Time To Live in seconds.
    var _sampleRateTTL = 86400;

    // Sampling mode:
    //   user - Per user,
    //   track - per track,
    //   all - send all tracks (debug),
    //   none: block all (debug)
    var _samplingMode = "user";

    // Max batch size in bytes. Raw track is sent when the limit is reached.
    var _batchSize = 60000; // SendBeacon to 64KB.

    // The batch is sent every _batchInterval seconds.
    var _batchInterval = 20;

    //
    // End of options
    //

    var _sampleRateKey = "_trackingplan_sample_rate";
    var _sampleRateTSKey = "_trackingplan_sample_rate_ts";
    var _isSampledUserKey = "_trackingplan_is_sampled_user";
    var _sampleRateDownloading = false;


    var _preQueue = [];
    var _postQueue = "";

    var Trackingplan = tpWindow.Trackingplan = {

        sdk: "js",
        sdkVersion: "1.5.1",

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
         *      samplingMode: "user",
         *      batchSize: 60000,
         *      batchInterval: 20
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
                _providerDomains = _mergeObjects(_providerDomains, options.customDomains || {});
                _debug = options.debug || _debug;
                _tracksEndPoint = options.tracksEndPoint || _tracksEndPoint;
                _configEndPoint = options.configEndPoint || _configEndPoint;
                _delayConfigDownload = options.delayConfigDownload || _delayConfigDownload;
                _sampleRateTTL = options.sampleRateTTL || _sampleRateTTL;
                _samplingMode = options.samplingMode || _samplingMode;
                _batchSize = options.batchSize || _batchSize;
                _batchInterval = options.batchInterval || _batchInterval;

                installImageInterceptor();
                installXHRInterceptor();
                installBeaconInterceptor();

                document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState === 'hidden') {
                        sendBatch("beacon");
                    }
                });
                tpWindow.addEventListener('pagehide', function () {
                    sendBatch("beacon");
                });

                setInterval(function () {
                    sendBatch(_sendMethod);
                }, _batchInterval * 1000);


                debugLog({ m: "TP init finished", options: options });
            } catch (error) {
                consoleWarn({ m: "TP init error", error: error });
            }
        }
    }

    function testCompat() {

        try {
            // Test localStorage
            tpStorage.setItem("_tp_t", "a");
            if (tpStorage.getItem("_tp_t") !== "a") return false;
            tpStorage.removeItem("_tp_t");
            // Test sendBeacon (ie11 out)
            if (typeof (navigator.sendBeacon) !== "function") return false;

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
                processRequest({ "method": "GET", "endpoint": url, "protocol": "img" });
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
                    _preQueue.push(request);
                    debugLog({ m: "Pre queued, queue length = " + _preQueue.length })
                    setTimeout(downloadSampleRate, _delayConfigDownload);
                    return false;
                }

                if (!shouldProcessRequest(_samplingMode, sampleRateDict)) {
                    debugLog({ m: "Request ignored (sampling)", mode: _samplingMode, dict: sampleRateDict });
                    return true;
                }
                queueOrSend(createRawTrack(request, provider, sampleRateDict["sampleRate"]));
                return true;

            } catch (error) {
                consoleWarn({ m: "Trackingplan process error", error: error, request: request });
            }
        }, 0);
    }

    function queueOrSend(rawTrack) {
        var jsonTrack = JSON.stringify(rawTrack);

        if ((jsonTrack.length + 2) > _batchSize) {
            sendDataToTrackingPlan("[" + jsonTrack + "]", _sendMethod);
            debugLog({ m: "Track > Batch Size: " + jsonTrack.length });
            return;
        }

        var newBatchLength = _postQueue.length + jsonTrack.length;
        if (newBatchLength > _batchSize) {
            debugLog({ m: "Batch reaching limit: " + newBatchLength });
            sendBatch(_sendMethod); // sendBatch clears the _postQueue.
        }

        newBatchLength = _postQueue.length + jsonTrack.length;
        debugLog({ m: "Queue len: " + newBatchLength, "rawTrack": rawTrack });
        if (_postQueue.length !== 0) _postQueue += ","
        _postQueue += jsonTrack;
    }

    function sendBatch(method) {
        if (_postQueue.length == 0) return;
        var postQueueCopy = _postQueue;
        _postQueue = "";
        sendDataToTrackingPlan("[" + postQueueCopy + "]", method);
    }

    function sendDataToTrackingPlan(jsonRawEvents, method) {
        debugLog({ m: "Sent", rawEvents: JSON.parse(jsonRawEvents) });

        // developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon
        function sendDataToTrackingplanWithBeacon(jsonRawEvents) {
            navigator.sendBeacon(_tracksEndPoint + _tpId, jsonRawEvents);
        }

        function sendDataToTrackingplanWithXHR(jsonRawEvents, callback) {
            var xhr = new XMLHttpRequest();
            xhr.open("POST", _tracksEndPoint + _tpId, true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    try {
                        debugLog({ m: "Parsed", response: JSON.parse(xhr.response) });
                    } catch (error) { };
                }
            }
            xhr.send(jsonRawEvents);
        }

        switch (method) {
            case "xhr":
                sendDataToTrackingplanWithXHR(jsonRawEvents);
                break;
            case "beacon":
                sendDataToTrackingplanWithBeacon(jsonRawEvents);
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
    function processPreQueue() {
        while (_preQueue.length) {
            var request = _preQueue.shift();
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
                    processPreQueue();
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

        debugLog({ m: "Trackingplan sample rate = " + rate + ". isSampledUser " + isSampledUser })
        tpStorage.setItem(_sampleRateTSKey, new Date().getTime())
        tpStorage.setItem(_sampleRateKey, rate)
        tpStorage.setItem(_isSampledUserKey, isSampledUser)
    }

    // Reads the sample rate from localstorage.
    function getSampleRateDict() {
        var ts = tpStorage.getItem(_sampleRateTSKey);
        if (ts === null) return false;

        if ((parseInt(ts) + _sampleRateTTL * 1000) < new Date().getTime()) { // expired
            debugLog({ m: "Trackingplan sample rate expired" });
            setSampleRate(false);
            return false;
        } else {
            return {
                "sampleRate": parseInt(tpStorage.getItem(_sampleRateKey)),
                "isSampledUser": parseInt(tpStorage.getItem(_isSampledUserKey))
            }
        }
    }

    function getAnalyticsProvider(endpoint) {
        for (var domain in _providerDomains) {
            if (endpoint.indexOf(domain) !== -1) return _providerDomains[domain];
        }
        return false;
    }

    function _mergeObjects(o1, o2) {
        for (var a in o2) { o1[a] = o2[a]; }
        return o1;
    }

    function debugLog(m) {
        _debug && tpConsole.log("TP " + _tpId, m);
    }

    function consoleWarn(m) {
        tpWindow.console && tpConsole.warn && tpConsole.warn(m);
    }
})();
