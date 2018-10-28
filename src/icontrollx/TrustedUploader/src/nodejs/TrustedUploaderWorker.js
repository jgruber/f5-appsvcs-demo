/* jshint node: true */
/* jshint esversion: 6 */

/*
  Copyright (c) 2017, F5 Networks, Inc.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  *
  http://www.apache.org/licenses/LICENSE-2.0
  *
  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
  either express or implied. See the License for the specific
  language governing permissions and limitations under the License.
*/
'use strict';

const url = require('url');
const fs = require('fs');
const CHUNK_LENGTH = 512000;

let filePath;
let targetHost = 'localhost';
let targetPort = '443';

/**
 * Upload Worker
 *
 * Uploads specified files to a specified server.
 */
class TrustedUploaderWorker {
    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedUploader";
        this.isPublic = true;
    }

    /**
     * Get can take 2 query params (bigip, filePath)
     * example: /shared/TrustedUploader?targetHost=10.144.72.186&targetPort=443&filePath=/tmp/file.rpm
     * @param {RestOperation} restOperation
     */
    onGet(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        filePath = query.filePath;

        if (!targetHost || !filePath) {
            let err = new Error("targetHost and filePath query parameters are required.");
            err.httpStatusCode = 400;
            restOperation.fail(err);
            return;
        }
        if (!targetPort) {
            targetPort = 443;
        }

        const stats = fs.statSync(filePath);
        const total = stats.size;
        let start = 0;
        let end = getEndBytePosition(total, CHUNK_LENGTH);

        const stream = fs.createReadStream(filePath, {
            highWaterMark: CHUNK_LENGTH
        });

        stream.on('data', (chunk) => {
            console.log(`Received ${chunk.length} bytes of data.`);

            const op = this.createRestOp(total, start, end, chunk);
            this.restRequestSender.sendPost(op).then(handlePostSuccess, handlePostError);

            // move start/end points forward
            start = end;
            end = getEndBytePosition(total, (start + chunk.length));
        });
        stream.on('end', () => {
            restOperation.setBody({
                targetHost: targetHost,
                targetPort: targetPort,
                from: filePath,
                to: `/var/config/rest/downloads`
            });
            this.completeRestOperation(restOperation);
        });
    }

    getDefaultRestOp() {
        const fileName = filePath.split('/').pop();
        const destUri = `https://${targetHost}:${targetPort}/mgmt/shared/file-transfer/uploads/${fileName}`;

        const op = this.restOperationFactory.createRestOperationInstance()
            .setMethod("Post")
            .setIdentifiedDeviceRequest(true)
            .setUri(url.parse(destUri))
            .setContentType("application/octet-stream");

        return op;
    }

    createRestOp(total, start, end, bytes) {
        const op = this.getDefaultRestOp();
        const range = [`${start}-`, (end - 1), '/', total].join('');

        op.setHeaders({
                'Content-Length': Buffer.byteLength(bytes),
                'Content-Range': range
            })
            .setContentType('application/octet-stream')
            .setBody(bytes);
        this.logger.severe(op.getHeaders());
        return op;
    }

}

/// Private Functions ///

function getEndBytePosition(total, size) {
    return (total < size) ? total : size;
}

function handlePostSuccess(response) {
    this.logger.debug(`segment uploaded successfully: ${response}`);
}

function handlePostError(err) {
    this.logger.debug(`segment upload error: ${err}`);
}


module.exports = TrustedUploaderWorker;