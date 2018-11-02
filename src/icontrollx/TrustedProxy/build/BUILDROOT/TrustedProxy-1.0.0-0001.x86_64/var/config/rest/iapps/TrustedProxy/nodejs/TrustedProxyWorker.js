/* jshint esversion: 6 */
/* jshint node: true */
"use strict";

const http = require('http');

/**
 * Trusted Device Proxy which handles only POST requests
 * @constructor
 */
class TrustedProxyWorker {

    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedProxy";
        this.isPassThrough = true;
        this.isPublic = true;
    }

    /**
     * handle onGet HTTP request - get the query paramater token for a trusted device.
     * @param {Object} restOperation
     */
    onGet(restOperation) {
        const paths = restOperation.uri.pathname.split('/');
        if (paths.length > 3) {
            const targetHost = paths[3];
            this.getToken(targetHost)
                .then((token) => {
                    restOperation.statusCode = 200;
                    restOperation.body = token;
                    this.completeRestOperation(restOperation);
                });
        } else {
            this.getTrustedDevices()
                .then((trustedDevices) => {
                    const tokens = {};
                    const tokenPromises = [];
                    trustedDevices.map((trustedDevice) => {
                        const tokenPromise = this.getToken(trustedDevice.address)
                            .then((token) => {
                                tokens[trustedDevice.address] = token;
                            });
                        tokenPromises.push(tokenPromise);
                    });
                    Promise.all(tokenPromises)
                        .then(() => {
                            restOperation.statusCode = 200;
                            restOperation.body = JSON.stringify(tokens);
                            this.completeRestOperation(restOperation);
                        });
                });
        }
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

    /**
     * handle trusted devices request - all trusted devices.
     * @param {Array} trusted devices
     */
    getTrustedDevices() {
        const trustedDeviceUrl = 'http://localhost:8100/mgmt/shared/resolver/device-groups/dockerContainers/devices';
        return new Promise((resolve) => {
            http.get(trustedDeviceUrl, (res) => {
                let body = '';
                res.on('data', (seg) => {
                    body += seg;
                });
                res.on('end', () => {
                    if (res.statusCode < 400) {
                        resolve(JSON.parse(body).items);
                    } else {
                        this.logger.severe('no trusted devices in dockerContainer device group');
                        resolve([]);
                    }
                });
                res.on('error', (err) => {
                    this.logger.severe('error getting trusted devices:' + err.message);
                    resolve([]);
                });
            });
        });
    }

    /**
     * handle getToken request - get the query paramater token for a trusted device.
     * @param {String} trust token good for 10 minutes
     */
    getToken(targetHost) {
        return new Promise((resolve) => {
            const tokenBody = JSON.stringify({ address: targetHost });
            let body = '';
            const postOptions = {
                host: 'localhost',
                port: 8100,
                path: '/shared/token',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Legth': tokenBody.length
                },
                method: 'POST'
            };
            const request = http.request(postOptions, (res) => {
                res.on('data', (seg) => {
                    body += seg;
                });
                res.on('end', () => {
                    resolve(body);
                    resolve(null);
                });
                res.on('error', (err) => {
                    this.logger.severe('error: ' + err);
                    resolve(null);
                });
            });
            request.write(tokenBody);
            request.end();
        });
    }


}

module.exports = TrustedProxyWorker;