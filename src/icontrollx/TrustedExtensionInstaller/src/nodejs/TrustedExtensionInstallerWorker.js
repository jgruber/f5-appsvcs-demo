"use strict";

const fs = require("fs");
const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const deviceGroupsUrl = 'http://localhost:8100/mgmt/shared/resolver/device-groups';
const ACTIVE = 'ACTIVE';
const UNDISCOVERED = 'UNDISCOVERED';
const FINISHED = 'FINISHED';

const queryTaskWaitTimerMS = 100;
const queryTaskTimeOutMS = 3000;

/**
 * delay timer
 * @returns Promise which resolves after timer expires
 */
const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms)
});

/**
 * Trusted Device Proxy which handles only POST requests
 * @constructor
 */
class TrustedExtensionInstallerWorker {

    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedExtensionInstaller";
        this.isPublic = true;
    }

    /**
     * Create a query task on a remote trusted device
     * @param targetHost remote target host
     * @param targetPort remote traget port
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    createExtensionQueryTask(targetHost = 'localhost', targetPort = 8100) {
        return new Promise((resolve) => {
            this.logger.info('creating query extension task for ' + targetHost + ':' + targetPort)
            const taskPostRequest = this.restOperationFactory.createRestOperationInstance()
            taskPostRequest.setBody({
                operation: "QUERY"
            });
            const queryTaskUrlPostfix = targetHost + ':' + targetPort + '/mgmt/shared/iapp/package-management-tasks';
            if (targetHost == 'localhost') {
                taskPostRequest.setUri('http://' + queryTaskUrlPostfix);
                this.restRequestSender.sendPost(taskPostRequest)
                    .then((response) => {
                        resolve(response.getBody.id);
                    })
                    .catch((err) => {
                        throw err;
                    });
            } else {
                taskPostRequest.setUri('https://' + queryTaskUrlPostfix);
                taskPostRequest.setIdentifiedDeviceRequest(true);
                taskPostRequest.setMethod('Post');
                taskPostRequest.setReferer(this.getUri().href);
                this.eventChannel.emit(this.eventChannel.e.sendRestOperation, taskPostRequest, 
                    (response) => {
                        this.logger.info('extension query task for ' + targetHost + ':' + targetPort + ': ' + JSON.stringify(response.getBody()));
                        resolve(response.getBody().id);
                    },
                    (err) => {
                        throw err;
                    }
                );                
            }
        });
    }

    /**
     * Download extension from URL
     * @param fileURL
     * @returns Promise when request completes which resolves the local ASG filename
     * @throws Error if request fails
     */
    downloadFileToASG(fileUrl) {
        return new Promise((resolve) => {
            try {
                const parsedFileUrl = url.parse(fileUrl);
                if (!parsedFileUrl) {
                    parsedFileUrl.protocol = 'file';
                }
                if (parsedFileUrl.protocol === 'file') {
                    if (!fs.existsSync(parsedFileUrl.pathname)) {
                        const fileUrlError = new Error();
                        fileUrlError.message = "file: " + parsedFileUrl.pathname + " not found";
                        throw fileUrlError;
                    }
                    resolve(parsedFileUrl.pathname);
                } else if (parsedFileUrl.protocol === 'http' || parsedFileUrl.protocol === 'https') {
                    const downloadFileName = '/tmp/' + path.basename(parsedFileUrl.pathname);
                    if (fs.existsSync(downloadFileName)) {
                        resolve(downloadFileName);
                    } else {
                        try {
                            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
                            const downloadFile = fs.createWriteStream(downloadFileName);
                            if (parsedFileUrl.protocol === 'http') {
                                const request = http.get(fileUrl, (response) => {
                                    reponse.pipe(downloadFile);
                                });
                            } else {
                                const request = https.get(fileUrl, (response) => {
                                    reponse.pipe(downloadFile);
                                });
                            }
                        } catch (err) {
                            if (fs.existsSync(downloadFileName)) {
                                fs.unlink(downloadFileName);
                            }
                            throw err;
                        }
                    }
                } else {
                    const fileUrlError = new Error();
                    fileUrlError.message = "unsupported protocol: " + parsedFileUrl.protocol;
                    throw fileUrlError;
                }
            } catch (err) {
                throw err;
            }
        });
    }

    /**
     * Multipart Upload to trusted device
     * @param tragetHost remote target host
     * @param targetPort remote target Port
     * @param filename local ASG file to upload
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    uploadFile(tragetHost = 'localhost', targetPort = 8100, filename) {
        return new Promise((resolve) => {
            if (!fs.existsSync(filename)) {
                const uploadError = new Error()
                uploadError.message = 'the requested file to upload:' + filename + ' was not found.'
                throw uploadError
            }

            const fileStat = fs.statSync(filename);
            const fd = fs.openSync(filename, 'r');
            const CHUNK_SIZE = 1000000;

            const uploadPostRequest = this.restOperationFactory.createRestOperationInstance()
            const uploadUrlPostfix = targetHost + ':' + targetPort + '/mgmt/shared/file-transfer/uploads/' + path.basename(filename);
            const uploadPart = (start, end) => {
                const contentLength = ((end - start) + 1);
                uploadPostRequest.setHeaders({
                    'Content-Range': start + '-' + end + '/' + fstats.size,
                    'Content-Length': contentLength;
                })
                uploadPostRequest.setContentType('application/octet-stream');
                const databuf = new Buffer(contentLength);
                fs.read(fd, databuf, 0, contentLength, start);
                uploadPostRequest.setBody(databuf.toString('utf8'));
                if (targetHost == 'localhost') {
                    taskPostRequest.setUri('http://' + uploadUrlPostfix);
                    this.restRequestSender.sendPost(uploadPostRequest)
                        .then((response) => {
                            if (end === fileStat.size - 1) {
                                resolve();
                            } else {
                                const next_start = start + CHUNK_SIZE;
                                const next_end = (() => {
                                    if (end + CHUNK_SIZE > fileStat.size - 1)
                                        return fileStat.size - 1
                                    return end + CHUNK_SIZE
                                })()
                                uploadPart(next_start, next_end);
                            }
                        })
                        .catch((err) => {
                            throw err;
                        });
                } else {
                    taskPostRequest.setUri('https://' + queryTaskUrlPostfix);
                    taskPostRequest.setIdentifiedDeviceRequest(true);
                    taskPostRequest.setMethod('Post');
                    taskPostRequest.setReferer(this.getUri().href);
                    this.eventChannel.emit(this.eventChannel.e.sendRestOperation, taskPostRequest, 
                        (response) => {
                            if (end === fileStat.size - 1) {
                                resolve();
                            } else {
                                const next_start = start + CHUNK_SIZE;
                                const next_end = (() => {
                                    if (end + CHUNK_SIZE > fileStat.size - 1)
                                        return fileStat.size - 1
                                    return end + CHUNK_SIZE
                                })()
                                uploadPart(next_start, next_end);
                            }
                        },
                        (err) => {
                            throw err;
                        }
                    );                
                }

            };
            setImmediate(() => {
                if (CHUNK_SIZE < fileStat.size) {
                    uploadPart(0, CHUNK_SIZE - 1);
                } else {
                    uploadPart(0, fileStat.size - 1);
                }
            });
        });
    }

    /**
     * Install extension task to trusted device
     * @param tragetHost remote target host
     * @param targetPort remote target Port
     * @param filename of previously uploaded file to remote host
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    installExtension(tragetHost = 'localhost', targetPort = 8100, filename) {
        return new Promise((resolve) => {
            const taskPostRequest = this.restOperationFactory.createRestOperationInstance()
            const queryTaskUrlPostfix = targetHost + ':' + targetPort + '/mgmt/shared/iapp/package-management-tasks';
            taskPostRequest.setBody({
                operation: "INSTALL",
                packageFilePath: filename
            });
            if (targetHost == 'localhost') {
                targetPostRequest.setUri('http://' + queryTaskUrlPostfix)
                this.restRequestSender.sendPost(targetPostRequest)
                .then((response) => {
                    resolve(response.getBody().id);
                })
                .catch((err) => {
                    throw err;
                })
            } else {
                targetPostRequest.setUri('https://' + queryTaskUrlPostfix)
                targetPostRequest.setIdentifiedDeviceRequest(true);
                targetPostRequest.setReferer(this.getUri().href);
                targetPostRequest.setMethod('Post');
                this.eventChannel.emit(this.eventChannel.e.sendRestOperation, targetPostRequest, 
                    (response) => {
                        resolve(response.getBody().id);
                    },
                    (err) => {
                        throw err;
                    }  
                );
            }
        });
    }

    /**
     * Uninstall extension task to trusted device
     * @param tragetHost remote target host
     * @param targetPort remote target Port
     * @param packagName of previously installed packate on the remote host
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    uninstallExtension(tragetHost = 'localhost', targetPort = 8100, packageName) {
        return new Promise((resolve) => {
            const taskPostRequest = this.restOperationFactory.createRestOperationInstance()
            const queryTaskUrlPostfix = targetHost + ':' + targetPort + '/mgmt/shared/iapp/package-management-tasks';
            taskPostRequest.setBody({
                operation: "UNINSTALL",
                packageName: packageName
            });
            if (targetHost == 'localhost') {
                targetPostRequest.setUri('http://' + queryTaskUrlPostfix);
                this.restRequestSender.sendPost(targetPostRequest)
                .then((response) => {
                    resolve(response.getBody().id);
                })
                .catch((err) => {
                    throw err;
                })
            } else {
                targetPostRequest.setUri('https://' + queryTaskUrlPostfix)
                targetPostRequest.setIdentifiedDeviceRequest(true);
                targetPostRequest.setReferer(this.getUri().href);
                targetPostRequest.setMethod('Post');
                this.eventChannel.emit(this.eventChannel.e.sendRestOperation, targetPostRequest,
                    (response) => {
                        resolve(response.getBody().id);
                    },
                    (err) => {
                        throw err;
                    }  
                );
            }
        });
    }

    /**
     * Poll until install task it 'FINISHED' and then return the task queryResponse
     * @param tragetHost remote target host
     * @param targetPort remote target Port
     * @param taskId
     * @returns Promise with queryResponse as the resolve
     * @throws Error if reques does not reach FINISHED in timeout
     */
    pollTaskUntilFinished(tragetHost = 'localhost', targetPort = 8100, queryTaskId) {
        return new Promise((resolve) => {
            const taskGetRequest = this.restOperationFactory.createRestOperationInstance()
            const queryTaskUrlPostfix = targetHost + ':' + targetPort + '/mgmt/shared/iapp/package-management-tasks/' + queryTaskId;

            if (targetHost == 'localhost') {
                targetPostRequest.setUri('http://' + queryTaskUrlPostfix)
            } else {
                targetPostRequest.setUri('https://' + queryTaskUrlPostfix)
                targetPostRequest.setIdentifiedDeviceRequest(true)
            }
            targetPostRequest.setReferer(this.getUri().href);

            const numberOfRequests = queryTaskTimeOutMS / queryTaskWaitTimerMS;

            function pollStatus(targetPostRequest) {
                this.logger.info('polling ' + numberOfRequests + ' for taskId: ' + queryTaskId + ' on device: ' + targetHost + ':' + targetPort);
                if (numberOfRequests > 0) {
                    numberOfRequests = numberOfRequests - 1;
                } else {
                    const pollError = new Error();
                    pollError.message = 'task:' + queryTaskId + ' did not complete before timing out'
                    throw pollError;
                }
                this.restRequestSender.sendGet(taskGetRequest)
                    .then((response) => {
                        const body = response.getBody();
                        this.logger.info('taskId: ' + queryTaskId + ' status: ' + body.status);
                        if (body.status === FINISHED) {
                            resolve(body.queryResponse);
                        } else {
                            wait(queryTaskWaitTimerMS)
                                .then(() => {
                                    poolStatus(targetPostRequest);
                                })
                        }
                    })
                    .catch((err) => {
                        throw err;
                    })
            }
        });
    }

    /**
     * Request to get all device groups defined on the ASG
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    getDeviceGroups() {
        return new Promise((resolve) => {
            const deviceGroupsGetRequest = this.restOperationFactory.createRestOperationInstance()
                .setUri(this.url.parse(deviceGroupsUrl));
            this.restRequestSender.sendGet(deviceGroupsGetRequest)
                .then((response) => {
                    let respBody = response.getBody();
                    if (!respBody.hasOwnProperty('items')) {
                        resolve([]);
                    }
                    resolve(respBody.items);
                })
                .catch(err => {
                    this.logger.severe('could not get a list of device groups:' + err.message);
                    throw err;
                });
        });
    }

    /**
     * Get all devices in device groups defined on the ASG
     * @param boolean to return TMOS concerns in the devices attributes
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    getDevices(inlcudeHidden = false) {
        return new Promise((resolve) => {
            const devices = [];
            this.getDeviceGroups()
                .then((deviceGroups) => {
                    // For each device group, query for devices.
                    const devicesPromises = [];
                    deviceGroups.map((devicegroup, indx) => {
                        const devicesGroupUrl = deviceGroupsUrl + '/' + devicegroup.groupName + '/devices';
                        const devicesGetRequest = this.restOperationFactory.createRestOperationInstance()
                            .setUri(this.url.parse(devicesGroupUrl));
                        const devicesGetPromise = this.restRequestSender.sendGet(devicesGetRequest)
                            .then((response) => {
                                const devicesBody = response.getBody();
                                // Return all devices in groups which are not ASGs.
                                devicesBody.items.map((device, inc) => {
                                    if (device.hasOwnProperty('mcpDeviceName') ||
                                        device.state == UNDISCOVERED ||
                                        inlcudeHidden) {
                                        const returnDevice = {
                                            targetHost: device.address,
                                            targetPort: device.httpsPort,
                                            state: device.state
                                        };
                                        // Add TMOS specific concerns for used for processing.
                                        // These concerns should not be returned to clients.
                                        if (inlcudeHidden) {
                                            returnDevice.machineId = device.machineId;
                                            returnDevice.url = devicesGroupUrl + '/' + device.uuid;
                                            if (device.hasOwnProperty('mcpDeviceName') ||
                                                device.state == UNDISCOVERED) {
                                                returnDevice.isBigIP = true;
                                            } else {
                                                returnDevice.isBigIP = false;
                                            }
                                        }
                                        devices.push(returnDevice);
                                    }
                                });
                            })
                            .catch((err) => {
                                this.logger.severe('Error getting devices from device group:' + err.message);
                                throw err;
                            });
                        devicesPromises.push(devicesGetPromise);
                    });
                    Promise.all(devicesPromises)
                        .then(() => {
                            resolve(devices);
                        })
                        .catch((err) => {
                            throw err;
                        });
                })
                .catch((err) => {
                    this.logger.severe('Error getting device groups:' + err.message);
                    throw err;
                });
        });
    }

    /**
     * Get all extension installed on all trusted devices
     * @param includeLocalASG - boolean to include extension on the local ASG
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    getExtensions(includeLocalASG = false) {
        return new Promise((resolve) => {
            this.logger.info('getting trusted devices on this ASG')
            const extensions = {};
            const queryPromises = [];
            // First get all trusted devices 
            const trustedDevices = this.getDevices()
                .then((trustedDevices) => {
                    if (includeLocalASG) {
                        trustedDevices.push({
                            targetHost: 'localhost',
                            targetPort: 8100
                        });
                    }
                    this.logger.info('getting extensions on: ' + JSON.stringify(trustedDevices));
                    trustedDevices.map((device) => {
                        // For each trusted device start a query task
                        const queryTask = this.createExtensionQueryTask(device.targetHost, device.targetPort)
                            .then((taskId) => {
                                this.logger.info('query taskId is: ' + taskId + ' for: ' + JSON.stringify(device));
                                // For each trusted device poll until the query tasks are done
                                this.pollTaskUntilFinished(device.tragetHost, device.taretPort, taskId)
                                    .then((queryResponse) => {
                                        // Combine the results
                                        const key = targetHost + ":" + targetPort;
                                        extensions.key = queryResponse;
                                    })
                            })
                            .catch((err) => {
                                throw err;
                            })
                        queryPromises.push(queryTask);
                    })
                    this.logger.info('waiting on ' + queryPromises.length + ' promises for query tasks to complete.')
                    Promise.all(queryPromises)
                        .then(() => {
                            resolve(extensions);
                        })
                        .catch((err) => {
                            throw err;
                        });
                })
        });
    }

    /**
     * handle onGet HTTP request to get list extension on trusted devices
     * @param {Object} restOperation
     */
    onGet(restOperation) {
        try {
            this.getExtensions(true)
                .then((extensions) => {
                    restOperation.statusCode = 200;
                    restOperation.body = {
                        extensions: extensions
                    };
                    this.completeRestOperation(restOperation);
                })
                .catch((err) => {
                    throw err;
                });
        } catch (err) {
            this.logger.severe("GET request to retrieve extensions failed: \n%s", err);
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }
}

module.exports = TrustedExtensionInstallerWorker;