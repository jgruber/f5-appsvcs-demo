"use strict";

/**
 * Trusted Device Proxy which handles only POST requests
 * @constructor
 */
class TrustedProxyWorker {
    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedProxy";
        this.isPublic = true;
    }

    /**
     * handle onPost HTTP request - proxy reuest to trusted device.
     * @param {Object} restOperation
     */
    onPost(restOperation) {
        const body = restOperation.getBody();
        const refThis = this;
        // Create the framework request RestOperation to proxy to a trusted device.
        let identifiedDeviceRequest = this.restOperationFactory.createRestOperationInstance()
            // Tell the ASG to resolve trusted device for this request.
            .setIdentifiedDeviceRequest(true)
            .setIdentifiedDeviceGroupName(body.groupName)
            // Discern the type of request to proxy from the 'method' attributes in the request body.
            .setMethod(body.method || "Get")
            // Discern the URI for the request to proxy from the 'uri' attribute in the request body. 
            .setUri(this.url.parse(body.uri))
            // Discern the HTTP headers for the request to proxy from the 'headers' attribute in the request body.
            .setHeaders(body.headers || restOperation.getHeaders())
            // Discern the HTTP body for the request to proxy from the 'body' attribute in the request body.
            .setBody(body.body)
            // Derive the referer from the parsed URI.
            .setReferer(this.getUri().href);

        this.eventChannel.emit(this.eventChannel.e.sendRestOperation, identifiedDeviceRequest,
            function (resp) {
                // Return the HTTP status code from the proxied response.
                restOperation.statusCode = resp.statusCode;
                // Return the HTTP headers from the proxied response.
                restOperation.headers = resp.headers;
                // Return the body from the proxied response.
                restOperation.body = resp.body;
                // emmit event to complete this response through the REST framework.
                refThis.completeRestOperation(restOperation);
            },
            function (err) {
                // The proxied response was an error. Forward the error through the REST framework.
                refThis.logger.severe("Request to %s failed: \n%s", body.uri, err ? err.message : "");
                restOperation.fail(err);
            }
        );
    }
}

module.exports = TrustedProxyWorker;