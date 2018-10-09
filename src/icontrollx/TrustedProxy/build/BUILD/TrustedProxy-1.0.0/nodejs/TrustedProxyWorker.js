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
     * handle onPost HTTP request
     * @param {Object} restOperation
     */
    onPost(restOperation) {
        const body = restOperation.getBody();
        const refThis = this;

        let identifiedDeviceRequest = this.restOperationFactory.createRestOperationInstance()
            .setIdentifiedDeviceRequest(true)
            .setIdentifiedDeviceGroupName(body.groupName)
            .setMethod(body.method || "Get")
            .setUri(this.url.parse(body.uri))
            .setHeaders(body.headers || restOperation.getHeaders())
            .setBody(body.body)
            .setContentType(body.contentType || "application/json")
            .setReferer(this.getUri().href);

        this.eventChannel.emit(this.eventChannel.e.sendRestOperation, identifiedDeviceRequest,
            function (resp) {
                restOperation.statusCode = resp.statusCode;
                restOperation.headers = resp.headers;
                restOperation.body = resp.body;
                refThis.completeRestOperation(restOperation);
            },
            function (err) {
                refThis.logger.severe("Request to %s failed: \n%s", body.uri, err ? err.message : "");
                restOperation.fail(err);
            }
        );
    }
}

module.exports = TrustedProxyWorker;