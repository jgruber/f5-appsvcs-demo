/* jshint esversion: 6 */
/* jshint node: true */
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const pollDelay = 2000;
const FINISHED = 'FINISHED';
const FAILED = 'FAILED';
const UNDISCOVERED = 'UNDISCOVERED';
const VALIDDOWNLOADPROTOCOLS = ['file:', 'http:', 'https:'];

const deviceGroupsUrl = 'http://localhost:8100/mgmt/shared/resolver/device-groups';

let downloadUrl;
let rpmFile;
let targetHost = 'localhost';
let targetPort = '443';
let name;

let inFlight = {};

/**
 * Upload Worker
 *
 * Uploads specified files to a specified server.
 */
class TrustedExtensionsWorker {
    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedExtensions";
        this.isPublic = true;
    }

    /**
     * Get can take 3 query params (tragetHost, targetPort, name)
     * example: /shared/TrustedExtensions?targetHost=10.144.72.186&targetPort=443&name=TrustedProxy
     * @param {RestOperation} restOperation
     */
    onGet(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;

        // default behavior
        if (!targetHost) {
            targetHost = 'localhost';
        }
        if (targetHost == 'localhost') {
            targetPort = 8100;
        }
        if (!targetPort) {
            targetPort = 443;
        }

        this.validateTarget()
            .then(() => {
                this.getExtensions()
                    .then((extensions) => {
                        if (name) {
                            extensions.map((extension) => {
                                if (extension.name == name) {
                                    restOperation.statusCode = 200;
                                    restOperation.setContentType('application/json');
                                    restOperation.body = extension;
                                    this.completeRestOperation(restOperation);
                                    return;
                                }
                            });
                            const err = new Error(`no extension with name ${name} found.`);
                            err.httpStatusCode = 404;
                            restOperation.fail(err);
                        } else {
                            restOperation.statusCode = 200;
                            restOperation.setContentType('application/json');
                            restOperation.body = extensions;
                            this.completeRestOperation(restOperation);
                        }
                    })
                    .catch((err) => {
                        err.httpStatusCode = 400;
                        restOperation.fail(err);
                    });
            })
            .catch((err) => {
                err.httpStatusCode = 400;
                restOperation.fail(err);
            });

    }
    /**
     * Post can take 3 query params (tragetHost, targetPort, url)
     * exemple: /shared/TrustedExtentions?targetHost=10.144.72.186?targetPort=443&url=https://github.com/F5Networks/f5-appsvcs-extension/releases/download/v3.5.0/f5-appsvcs-3.5.0-3.noarch.rpm
     * @param {RestOperation} restOperation
     */
    onPost(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        downloadUrl = query.url;

        const createBody = restOperation.getBody();
        if (createBody.hasOwnProperty('targetHost')) {
            targetHost = createBody.targetHost;
        }
        if (createBody.hasOwnProperty('targetPort')) {
            targetPort = createBody.targetPort;
        }
        if (createBody.hasOwnProperty('url')) {
            downloadUrl = createBody.url;
        }

        if (!downloadUrl) {
            const err = new Error('a download URL must be defined to install a package');
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }

        // default behavior
        if (!targetHost) {
            targetHost = 'localhost';
        }
        if (targetHost == 'localhost') {
            targetPort = 8100;
        }
        if (!targetPort) {
            targetPort = 443;
        }

        rpmFile = path.basename(downloadUrl);

        const inFlightIndex = `${targetHost}:${targetPort}:${rpmFile}`;
        if (Object.keys(inFlight).includes(inFlightIndex)) {
            const err = Error(`package with rpmFile ${rpmFile} is already installing with state ${inFlight[inFlightIndex].state} on target ${targetHost}:${targetPort}`);
            err.httpStatusCode = 500;
            restOperation.fail(err);
            return;
        }
        this.validateTarget()
            .then(() => {
                this.getPackageName()
                    .then((packageName) => {
                        if (packageName) {
                            const err = new Error(`package with rpmFile ${rpmFile} is already installed on target ${targetHost}:${targetPort}`);
                            err.httpStatusCode = 409;
                            restOperation.fail(err);
                        } else {
                            let returnExtension = {
                                rpmFile: rpmFile,
                                downloadUrl: downloadUrl,
                                state: "REQUESTED",
                                name: "",
                                version: "",
                                release: "",
                                arch: "",
                                packageName: "",
                                tags: []
                            };
                            inFlight[inFlightIndex] = returnExtension;
                            this.installExtensionToTarget(targetHost, targetPort, downloadUrl, rpmFile)
                                .then((success) => {
                                    if (success) {
                                        delete inFlight[inFlightIndex];
                                    } else {
                                        const err = new Error(`package with rpmFile ${rpmFile} was not installed on target ${targetHost}:${targetPort}`);
                                        returnExtension = inFlight[inFlightIndex];
                                        returnExtension.state = 'ERROR';
                                        returnExtension.tags.push('err: ' + err.message);
                                    }
                                })
                                .catch((err) => {
                                    returnExtension = inFlight[inFlightIndex];
                                    returnExtension.state = 'ERROR';
                                    returnExtension.tags.push('err: ' + err.message);
                                });
                            restOperation.statusCode = 202;
                            restOperation.setContentType('application/json');
                            restOperation.body = returnExtension;
                            this.completeRestOperation(restOperation);
                        }
                    })
                    .catch((err) => {
                        err.httpStatusCode = 400;
                        restOperation.fail(err);
                    });
            })
            .catch((err) => {
                err.httpStatusCode = 400;
                restOperation.fail(err);
            });
    }
    /**
     * Put can take 3 query params (tragetHost, targetPort, url)
     * exemple: /shared/TrustedExtentions?targetHost=10.144.72.186?targetPort=443&url=https://github.com/F5Networks/f5-appsvcs-extension/releases/download/v3.5.0/f5-appsvcs-3.5.0-3.noarch.rpm
     * This method simply uninstalls and reinstalls an extension on trusted host. Good for testing!
     * @param {RestOperation} restOperation
     */
    onPut(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        downloadUrl = query.url;

        const createBody = restOperation.getBody();
        if (createBody.hasOwnProperty('targetHost')) {
            targetHost = createBody.targetHost;
        }
        if (createBody.hasOwnProperty('targetPort')) {
            targetPort = createBody.targetPort;
        }
        if (createBody.hasOwnProperty('url')) {
            downloadUrl = createBody.url;
        }

        if (!downloadUrl) {
            const err = new Error('a download URL must be defined to install a package');
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }

        // default behavior
        if (!targetHost) {
            targetHost = 'localhost';
        }
        if (targetHost == 'localhost') {
            targetPort = 8100;
        }
        if (!targetPort) {
            targetPort = 443;
        }

        rpmFile = path.basename(downloadUrl);

        const inFlightIndex = `${targetHost}:${targetPort}:${rpmFile}`;

        this.validateTarget()
            .then(() => {
                this.getPackageName()
                    .then((packageName) => {
                        if (packageName) {
                            this.uninstallExtension(packageName)
                                .then((success) => {
                                    if (success) {
                                        let returnExtension = {
                                            rpmFile: rpmFile,
                                            downloadUrl: downloadUrl,
                                            state: "REQUESTED",
                                            name: "",
                                            version: "",
                                            release: "",
                                            arch: "",
                                            packageName: "",
                                            tags: []
                                        };
                                        inFlight[inFlightIndex] = returnExtension;
                                        this.installExtensionToTarget(targetHost, targetPort, downloadUrl, rpmFile)
                                            .then((success) => {
                                                if (success) {
                                                    delete inFlight[inFlightIndex];
                                                } else {
                                                    const err = new Error(`package with rpmFile ${rpmFile} was not installed on target ${targetHost}:${targetPort}`);
                                                    returnExtension = inFlight[inFlightIndex];
                                                    returnExtension.state = 'ERROR';
                                                    returnExtension.tags.push('err: ' + err.message);
                                                }
                                            })
                                            .catch((err) => {
                                                returnExtension = inFlight[inFlightIndex];
                                                returnExtension.state = 'ERROR';
                                                returnExtension.tags.push('err: ' + err.message);
                                            });
                                        restOperation.statusCode = 202;
                                        restOperation.setContentType('application/json');
                                        restOperation.body = returnExtension;
                                        this.completeRestOperation(restOperation);
                                    } else {
                                        const err = new Error(`package in ${rpmFile} could not be uninstalled to update on target ${targetHost}:${targetPort}`);
                                        err.httpStatusCode = 500;
                                        restOperation.fail(err);
                                    }
                                })
                                .catch((err) => {
                                    const error = new Error(`package in ${rpmFile} could not be uninstalled to update on target ${targetHost}:${targetPort} - ${err.message}`);
                                    error.httpStatusCode = 500;
                                    restOperation.fail(error);
                                });
                        } else {
                            let returnExtension = {
                                rpmFile: rpmFile,
                                downloadUrl: downloadUrl,
                                state: "REQUESTED",
                                name: "",
                                version: "",
                                release: "",
                                arch: "",
                                packageName: "",
                                tags: []
                            };
                            inFlight[inFlightIndex] = returnExtension;
                            this.installExtensionToTarget(targetHost, targetPort, downloadUrl, rpmFile)
                                .then((success) => {
                                    if (success) {
                                        delete inFlight[inFlightIndex];
                                    } else {
                                        const err = new Error(`package with rpmFile ${rpmFile} was not installed on target ${targetHost}:${targetPort}`);
                                        returnExtension = inFlight[inFlightIndex];
                                        returnExtension.state = 'ERROR';
                                        returnExtension.tags.push('err: ' + err.message);
                                    }
                                })
                                .catch((err) => {
                                    returnExtension = inFlight[inFlightIndex];
                                    returnExtension.state = 'ERROR';
                                    returnExtension.tags.push('err: ' + err.message);
                                });
                            restOperation.statusCode = 202;
                            restOperation.setContentType('application/json');
                            restOperation.body = returnExtension;
                            this.completeRestOperation(restOperation);
                        }
                    })
                    .catch((err) => {
                        err.httpStatusCode = 400;
                        restOperation.fail(err);
                    });
            })
            .catch((err) => {
                err.httpStatusCode = 400;
                restOperation.fail(err);
            });
    }
    /**
     * Delete can take 3 query params (tragetHost, targetPort, url)
     * example: /shared/TrustedExtensions?targetHost=10.144.72.186&targetPort=443&url=https://github.com/F5Networks/f5-appsvcs-extension/releases/download/v3.5.0/f5-appsvcs-3.5.0-3.noarch.rpm
     * @param {RestOperation} restOperation
     */
    onDelete(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        downloadUrl = query.url;

        if (!downloadUrl) {
            const err = new Error('a download URL must be defined to uninstall a package');
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }

        // default behavior
        if (!targetHost) {
            targetHost = 'localhost';
        }
        if (targetHost == 'localhost') {
            targetPort = 8100;
        }
        if (!targetPort) {
            targetPort = 443;
        }

        rpmFile = path.basename(downloadUrl);

        const inFlightIndex = `${targetHost}:${targetPort}:${rpmFile}`;

        let deletedInFlight = false;

        if (Object.keys(inFlight).includes(inFlightIndex)) {
            delete inFlight[inFlightIndex];
            deletedInFlight = true;
        }

        this.validateTarget()
            .then(() => {
                this.getPackageName()
                    .then((packageName) => {
                        if (packageName) {
                            this.uninstallExtension(packageName)
                                .then((success) => {
                                    if (success) {
                                        restOperation.statusCode = 200;
                                        restOperation.body = {
                                            msg: `package in rpmFile ${rpmFile} uninstalled on target ${targetHost}:${targetPort}`
                                        };
                                        this.completeRestOperation(restOperation);
                                    } else {
                                        const err = new Error(`package in ${rpmFile} could not be uninstalled on target ${targetHost}:${targetPort}`);
                                        err.httpStatusCode = 500;
                                        restOperation.fail(err);
                                    }
                                })
                                .catch((err) => {
                                    const error = new Error(`package in ${rpmFile} could not be uninstalled on target ${targetHost}:${targetPort} - ${err.message}`);
                                    error.httpStatusCode = 500;
                                    restOperation.fail(error);
                                });
                        } else {
                            if (!deletedInFlight) {
                                const err = new Error(`package in ${rpmFile} not installed on target ${targetHost}:${targetPort}`);
                                err.httpStatusCode = 404;
                                restOperation.fail(err);
                            } else {
                                restOperation.statusCode = 200;
                                restOperation.body = {
                                    msg: `package in rpmFile ${rpmFile} uninstalled on target ${targetHost}:${targetPort}`
                                };
                                this.completeRestOperation(restOperation);
                            }
                        }
                    })
                    .catch((err) => {
                        err.httpStatusCode = 500;
                        restOperation.fail(err);
                    });
            })
            .catch((err) => {
                err.httpStatusCode = 400;
                restOperation.fail(err);
            });
    }

    getExtensions() {
        return new Promise((resolve, reject) => {
            let returnExtensions = [];
            Object.keys(inFlight).map((extension) => {
                returnExtensions.push(inFlight[extension]);
            });
            this.restRequestSender.sendPost(this.getQueryRestOp())
                .then((response) => {
                    let task = response.getBody();
                    if (task.hasOwnProperty('id')) {
                        this.logger.info('query extension task is:' + task.id);
                        this.pollTaskUntilFinishedAndDelete(task.id, 10000)
                            .then((extensions) => {
                                extensions.map((extension) => {
                                    const rpmFile = extension.packageName + '.rpm';
                                    extension.rpmFile = rpmFile;
                                    extension.downloadUrl = 'https://' + targetHost + ':' + targetPort + '/mgmt/shared/file-transfer/downloads/' + rpmFile;
                                    extension.state = 'AVAILABLE';
                                    returnExtensions.push(extension);
                                });
                                resolve(returnExtensions);
                            })
                            .catch((err) => {
                                throw err;
                            });
                    } else {
                        throw new Error('query request did not return a task ID: ' + JSON.stringify(task));
                    }
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /* jshint ignore:start */
    getPackageName() {
        return new Promise(async (resolve, reject) => {
            try {
                const extensions = await this.getExtensions(targetHost, targetPort);
                extensions.map((extension) => {
                    if (rpmFile.startsWith(extension.packageName)) {
                        resolve(extension.packageName);
                    }
                });
                resolve();
            } catch (err) {
                reject(err);
            }
        })
    }
    /* jshint ignore:end */

    /* jshint ignore:start */
    installExtensionToTarget(targetHost, targetPort, downloadUrl, rpmFile) {
        return new Promise(async (resolve, reject) => {
            this.logger.info('installing extension ' + rpmFile);
            const inFlightIndex = `${targetHost}:${targetPort}:${rpmFile}`;
            let returnExtension = inFlight[inFlightIndex]
            returnExtension.state = 'DOWNLOADING';
            try {
                const filename = await this.downloadFileToGateway(rpmFile, downloadUrl)
                if (filename) {
                    if (Object.keys(inFlight).includes(inFlightIndex)) {
                        returnExtension.state = 'UPLOADING';
                        const uploaded = await this.uploadToDevice(filename, targetHost, targetPort);
                        if (uploaded) {
                            if (Object.keys(inFlight).includes(inFlightIndex)) {
                                returnExtension.state = 'INSTALLING';
                                const installed = await this.installExtension()
                                if (installed) {
                                    if (Object.keys(inFlight).includes(inFlightIndex)) {
                                        returnExtension.state = 'AVAILABLE';
                                        resolve(true);
                                    }
                                } else {
                                    if (Object.keys(inFlight).includes(inFlightIndex)) {
                                        const err = new Error(`package in ${rpmFile} could not be installed to target ${targetHost}:${targetPort}`);
                                        returnExtension.state = 'ERROR';
                                        returnExtension.tags['err: ' + err.message];
                                        reject(err);
                                    }
                                }
                            }
                        } else {
                            if (Object.keys(inFlight).includes(inFlightIndex)) {
                                const err = new Error(`could not upload rpmFile ${rpmFile} to target ${targetHost}:${targetPort}`);
                                returnExtension.state = 'ERROR';
                                returnExtension.tags['err: ' + err.message];
                                reject(err);
                            }
                        }
                    }
                } else {
                    if (Object.keys(inFlight).includes(inFlightIndex)) {
                        const err = new Error(`could not download rpmFile to gateway`);
                        returnExtension.state = 'ERROR';
                        returnExtension.tags['err: ' + err.message];
                        reject(err);
                    }
                }
            } catch (err) {
                if (Object.keys(inFlight).includes(inFlightIndex)) {
                    returnExtension.state = 'ERROR';
                    returnExtension.tags['err: ' + err.message];
                    reject(err);
                }
            }
        });
    }
    /* jshint ignore:end */

    installExtension() {
        return new Promise((resolve, reject) => {
            this.restRequestSender.sendPost(this.getInstallRestOp())
                .then((response) => {
                    let task = response.getBody();
                    if (task.hasOwnProperty('id')) {
                        this.logger.info('installing extension task is: ' + task.id);
                        this.pollTaskUntilFinishedAndDelete(task.id, 10000)
                            .then(() => {
                                resolve(true);
                            })
                            .catch((err) => {
                                reject(err);
                            });
                    } else {
                        reject(new Error('install request did not return a task ID: ' + JSON.stringify(task)));
                    }
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /* jshint ignore:start */
    uninstallExtensionOnTarget() {
        return new Promise(async (resolve, reject) => {
            try {
                this.logger.info('uninstalling extension ' + rpmFile);
                const packageName = await this.getPackageName();
                if (packageName) {
                    await this.uninstallExtension(packageName);
                    resolve(true);
                }
                resolve(false);
            } catch (err) {
                reject(err);
            }
        });
    }
    /* jshint ignore:end */

    uninstallExtension(packageName) {
        return new Promise((resolve, reject) => {
            this.restRequestSender.sendPost(this.getUninstallRestOp(packageName))
                .then((response) => {
                    let task = response.getBody();
                    if (task.hasOwnProperty('id')) {
                        this.logger.info('uninstalling extension task is:' + task.id);
                        this.pollTaskUntilFinishedAndDelete(task.id, 10000)
                            .then(() => {
                                resolve(true);
                            })
                            .catch((err) => {
                                reject(err);
                            });
                    } else {
                        reject(new Error('uninstall request did not return a task ID: ' + JSON.stringify(task)));
                    }
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    getQueryRestOp() {
        let protocol = 'https';
        if (targetHost == 'localhost') {
            protocol = 'http';
        }
        const destUri = `${protocol}://${targetHost}:${targetPort}/mgmt/shared/iapp/package-management-tasks/`;
        const destBody = '{ "operation": "QUERY" }';
        const op = this.restOperationFactory.createRestOperationInstance()
            .setUri(url.parse(destUri))
            .setContentType("application/json")
            .setBody(destBody);
        if (targetHost != 'localhost')
            op.setIdentifiedDeviceRequest(true);
        return op;
    }

    getUninstallRestOp(packageName) {
        let protocol = 'https';
        if (targetHost == 'localhost') {
            protocol = 'http';
        }
        const destUri = `${protocol}://${targetHost}:${targetPort}/mgmt/shared/iapp/package-management-tasks/`;
        const destBody = `{ "operation": "UNINSTALL", "packageName": ${packageName} }`;
        const op = this.restOperationFactory.createRestOperationInstance()
            .setUri(url.parse(destUri))
            .setContentType("application/json")
            .setBody(destBody);
        if (targetHost != 'localhost')
            op.setIdentifiedDeviceRequest(true);
        return op;
    }

    getInstallRestOp() {
        let protocol = 'https';
        if (targetHost == 'localhost') {
            protocol = 'http';
        }
        const destUri = `${protocol}://${targetHost}:${targetPort}/mgmt/shared/iapp/package-management-tasks/`;
        const destBody = `{ "operation": "INSTALL", "packageFilePath": "/var/config/rest/downloads/${rpmFile}" }`;
        const op = this.restOperationFactory.createRestOperationInstance()
            .setUri(url.parse(destUri))
            .setContentType("application/json")
            .setBody(destBody);
        if (targetHost != 'localhost')
            op.setIdentifiedDeviceRequest(true);
        return op;
    }

    getTaskStatusRestOp(taskId) {
        let protocol = 'https';
        if (targetHost == 'localhost') {
            protocol = 'http';
        }
        const destUri = `${protocol}://${targetHost}:${targetPort}/mgmt/shared/iapp/package-management-tasks/${taskId}`;
        const op = this.restOperationFactory.createRestOperationInstance()
            .setUri(url.parse(destUri))
            .setContentType("application/json");
        if (targetHost != 'localhost')
            op.setIdentifiedDeviceRequest(true);
        return op;
    }

    getDeleteTaskRestOp(taskId) {
        let protocol = 'https';
        if (targetHost == 'localhost') {
            protocol = 'http';
        }
        const destUri = `${protocol}://${targetHost}:${targetPort}/mgmt/shared/iapp/package-management-tasks/${taskId}`;
        const op = this.restOperationFactory.createRestOperationInstance()
            .setUri(url.parse(destUri))
            .setContentType("application/json");
        if (targetHost != 'localhost')
            op.setIdentifiedDeviceRequest(true);
        return op;
    }

    validateTarget() {
        return new Promise((resolve, reject) => {
            if (targetHost == 'localhost') {
                resolve(true);
            }
            this.getDevices()
                .then((devices) => {
                    devices.map((device) => {
                        if (device.targetHost == targetHost && device.targetPort == targetPort) {
                            resolve(true);
                        }
                    });
                    reject(new Error('target ' + targetHost + ':' + targetPort + ' is not a trusted device.'));
                });
        });
    }

    getDeviceGroups() {
        return new Promise((resolve, reject) => {
            const deviceGroupsGetRequest = this.restOperationFactory.createRestOperationInstance()
                .setUri(this.url.parse(deviceGroupsUrl));
            this.restRequestSender.sendGet(deviceGroupsGetRequest)
                .then((response) => {
                    let respBody = response.getBody();
                    if (!respBody.hasOwnProperty('items')) {
                        Promise.all([this.createDeviceGroup()])
                            .then(() => {
                                resolve([{
                                    groupName: 'dockerContainers'
                                }]);
                            })
                            .catch(err => {
                                this.logger.severe('could not create device group');
                                reject(err);
                            });
                    }
                    resolve(respBody.items);
                })
                .catch(err => {
                    this.logger.severe('could not get a list of device groups:' + err.message);
                    reject(err);
                });
        });
    }

    getDevices() {
        return new Promise((resolve, reject) => {
            const devices = [];
            this.getDeviceGroups()
                .then((deviceGroups) => {
                    const devicesPromises = [];
                    deviceGroups.map((devicegroup, indx) => {
                        const devicesGroupUrl = deviceGroupsUrl + '/' + devicegroup.groupName + '/devices';
                        const devicesGetRequest = this.restOperationFactory.createRestOperationInstance()
                            .setUri(this.url.parse(devicesGroupUrl));
                        const devicesGetPromise = this.restRequestSender.sendGet(devicesGetRequest)
                            .then((response) => {
                                const devicesBody = response.getBody();
                                devicesBody.items.map((device, inc) => {
                                    if (device.hasOwnProperty('mcpDeviceName') ||
                                        device.state == UNDISCOVERED) {
                                        const returnDevice = {
                                            targetHost: device.address,
                                            targetPort: device.httpsPort,
                                            state: device.state
                                        };
                                        devices.push(returnDevice);
                                    }
                                });
                            })
                            .catch((err) => {
                                this.logger.severe('Error getting devices from device group:' + err.message);
                                reject(err);
                            });
                        devicesPromises.push(devicesGetPromise);
                    });
                    Promise.all(devicesPromises)
                        .then(() => {
                            resolve(devices);
                        })
                        .catch((err) => {
                            reject(err);
                        });
                })
                .catch((err) => {
                    this.logger.severe('Error getting device groups:' + err.message);
                    throw err;
                });
        });
    }

    pollTaskUntilFinishedAndDelete(taskId, timeout) {
        return new Promise((resolve, reject) => {
            const start = new Date().getTime();
            let stop = start + timeout;
            let returnData = {};

            const poll = () => {
                this.restRequestSender.sendGet(this.getTaskStatusRestOp(taskId))
                    .then((response) => {
                        const queryBody = response.getBody();
                        if (queryBody.hasOwnProperty('status')) {
                            this.logger.info('extension tasks ' + taskId + ' returned status: ' + queryBody.status);
                            if (queryBody.status === FINISHED) {
                                if (queryBody.hasOwnProperty('queryResponse')) {
                                    returnData = queryBody.queryResponse;
                                } else {
                                    returnData = queryBody;
                                }
                                this.restRequestSender.sendDelete(this.getDeleteTaskRestOp(taskId));
                                resolve(returnData);
                            } else if (queryBody.status === FAILED) {
                                reject(new Error('Task failed returning' + queryBody));
                            } else {
                                wait(pollDelay)
                                    .then(() => {
                                        if (new Date().getTime() < stop) {
                                            poll();
                                        } else {
                                            reject(new Error('Task did not reach ' + FINISHED + ' status. Instead returned: ' + queryBody));
                                        }
                                    });
                            }
                        }
                    })
                    .catch((err) => {
                        reject(err);
                    });
            };

            setImmediate(poll);
        });
    }

    downloadFileToGateway(rpmFile, instanceUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.logger.info('downloading rpmFile:' + rpmFile + ' url:' + instanceUrl);
                if (!instanceUrl) {
                    resolve(false);
                }
                if (!rpmFile) {
                    rpmFile = path.basename(instanceUrl);
                }
                const filePath = `/var/config/rest/downloads/${rpmFile}`;
                if (fs.existsSync()) {
                    const fstats = fs.statSync(filePath);
                    this.logger.info('file ' + rpmFile + '(' + fstats.size + ' bytes) was deleted');
                    fs.unlinkSync(filePath);
                }
                const parsedUrl = url.parse(instanceUrl);
                if (VALIDDOWNLOADPROTOCOLS.includes(parsedUrl.protocol)) {
                    if (parsedUrl.protocol == 'file:') {
                        try {
                            copyFile(parsedUrl.pathname, true);
                            resolve(rpmFile);
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        this.logger.info('downloading ' + instanceUrl);
                        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0; // jshint ignore:line
                        var fws = fs.createWriteStream(filePath);
                        var request = https.get(instanceUrl, (response) => {
                                if (response.statusCode > 300 && response.statusCode < 400 && response.headers.location) {
                                    fs.unlinkSync(filePath);
                                    const redirectUrlParsed = url.parse(response.headers.location);
                                    let redirectUrl = parsedUrl.host + response.headers.location;
                                    if (redirectUrlParsed.hostname) {
                                        redirectUrl = response.headers.location;
                                    }
                                    this.logger.info('following download redirect to:' + redirectUrl);
                                    fws = fs.createWriteStream(filePath);
                                    request = https.get(redirectUrl, (response) => {
                                            this.logger.info('redirect has status: ' + response.statusCode + ' body:' + JSON.stringify(response.headers));
                                            response.pipe(fws);
                                            fws.on('finish', () => {
                                                fws.close();
                                                resolve(rpmFile);
                                            });
                                        })
                                        .on('error', (err) => {
                                            this.logger.severe('error downloading url ' + redirectUrl + ' - ' + err.message);
                                            fws.close();
                                            fs.unlinkSync(filePath);
                                            resolve(false);
                                        });
                                } else {
                                    response.pipe(fws);
                                    fws.on('finish', () => {
                                        fws.close();
                                        resolve(rpmFile);
                                    });
                                }
                            })
                            .on('error', (err) => {
                                this.logger.severe('error downloading url ' + instanceUrl + ' - ' + err.message);
                                fws.close();
                                fs.unlinkSync(filePath);
                                resolve(false);
                            });
                        request.end();
                    }
                } else {
                    const err = 'extension url must use the following protocols:' + JSON.stringify(VALIDDOWNLOADPROTOCOLS);
                    reject(new Error(err));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    /* jshint ignore:start */
    async uploadToDevice(rpmFile, targetHost, targetPort) {

        const uploadPart = (filePath, start, end, total, rpmFile, token) => {
            return new Promise((resolve) => {
                const headers = {
                    'Content-Type': 'application/octet-stream',
                    'Content-Range': (start + '-' + end + '/' + total),
                    'Content-Length': ((end - start) + 1),
                    'Connection': 'keep-alive'
                };
                let req
                if (targetHost == 'localhost') {
                    const postOptions = {
                        hostname: 'localhost',
                        port: 8100,
                        path: `/mgmt/shared/file-transfer/uploads/${rpmFile}`,
                        method: 'POST',
                        headers: headers
                    };
                    req = http.request(postOptions, (res) => {
                        if (res.statusCode > 399) {
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    });
                } else {
                    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
                    const postOptions = {
                        hostname: targetHost,
                        port: targetPort,
                        path: `/mgmt/shared/file-transfer/uploads/${rpmFile}?${token.queryParam}`,
                        method: 'POST',
                        headers: headers
                    };
                    req = https.request(postOptions, (res) => {
                        this.logger.info(res.statusCode + ' - ' + headers['Content-Range']);
                        if (res.statusCode > 399) {
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    });
                }
                const fstream = fs.createReadStream(filePath, {
                    start: start,
                    end: end
                });
                fstream.on('end', () => {
                    req.end();
                });
                fstream.pipe(req);
            });
        };
        try {
            const filePath = `/var/config/rest/downloads/${rpmFile}`;
            const fstats = fs.statSync(filePath);
            const fileEnd = fstats.size - 1;
            const CHUNK_SIZE = 512000;
            let start = 0;
            let end = fileEnd;
            if (CHUNK_SIZE < fileEnd - 1)
                end = CHUNK_SIZE - 1;
            const token = JSON.parse(await this.getToken(targetHost));
            this.logger.info(`uploading to ${targetHost}:${targetPort} - ${rpmFile} (${fstats.size} bytes)`);
            while (end <= fileEnd) {
                const chunkUploaded = await uploadPart(filePath, start, end, fstats.size, rpmFile, token); // jshint ignore:line
                if (chunkUploaded) {
                    start = start + CHUNK_SIZE;
                    if (start > fileEnd) {
                        break;
                    } else {
                        if (end + CHUNK_SIZE > fileEnd) {
                            end = fileEnd;
                        } else {
                            end = end + CHUNK_SIZE;
                        }
                    }
                }
            }
            return true;
        } catch (err) {
            this.logger.severe(err.message);
            this.logger.severe(err);
            return false;
        }
    }
    /* jshint ignore:end */

    getToken(targetHost) {
        return new Promise((resolve) => {
            const tokenBody = JSON.stringify({
                address: targetHost
            });
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

const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const copyFile = (rpmFilePath, symlink = false) => {
    const filename = path.basename(rpmFilePath);
    const dest = '/var/config/rest/downloads/' + filename;
    if (fs.existsSync(rpmFilePath)) {
        try {
            if (!fs.existsSync(dest)) {
                if (symlink) {
                    fs.symlinkSync(rpmFilePath, dest);
                } else {
                    fs.createReadStream(rpmFilePath).pipe(fs.createWriteStream(dest));
                }
            }
            return filename;
        } catch (err) {
            throw err;
        }
    } else {
        const err = 'file does not exist ' + rpmFilePath;
        console.error(err);
        throw Error(err);
    }
};

module.exports = TrustedExtensionsWorker;