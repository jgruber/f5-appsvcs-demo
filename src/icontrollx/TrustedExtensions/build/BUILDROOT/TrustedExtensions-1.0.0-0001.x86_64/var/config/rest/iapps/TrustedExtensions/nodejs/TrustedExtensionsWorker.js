/* jshint esversion: 6 */
/* jshint node: true */
'use strict';

const url = require('url');
const path = require('path');
const pollDelay = 2000;
const FINISHED = 'FINISHED';
const FAILED = 'FAILED';

let rpmFile;
let targetHost = 'localhost';
let targetPort = '443';
let name;

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
     * Get can take 2 query params (bigip, filePath)
     * example: /shared/TrustedUploader?targetHost=10.144.72.186&targetPort=443&filePath=/tmp/file.rpm
     * @param {RestOperation} restOperation
     */
    onGet(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        name = query.name;

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

        // query device for extensions
        try {
            this.getExtensions()
                .then((extensions) => {
                    if(name) {
                        extensions.map((extension) => {
                            if(extension.name == name ) {
                                restOperation.statusCode = 200;
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
                        restOperation.body = extensions;
                        this.completeRestOperation(restOperation);    
                    }
                });
        } catch (err) {
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }

    onPost(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        rpmFile = query.rpmFile;

        const createBody = restOperation.getBody();
        if (createBody.hasOwnProperty('targetHost')) {
            targetHost = createBody.targetHost;
        }
        if (createBody.hasOwnProperty('targetPort')) {
            targetPort = createBody.targetPort;
        }
        if (createBody.hasOwnProperty('rpmFile')) {
            rpmFile = createBody.rpmFile;
        }

        if (!rpmFile) {
            const err = new Error('rpmFile must be defined to install a package');
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

        // query device for extensions
        try {
            this.getExtensions()
                .then((extensions) => {
                    extensions.map((extension) => {
                        if (rpmFile.startsWith(extension.packageName)) {
                            const err = new Error(`package with rpmFile ${rpmFile} is already installed`);
                            err.httpStatusCode = 409;
                            restOperation.fail(err);
                        }
                    });
                    this.installExtension(rpmFile)
                        .then((success) => {
                            if (success) {
                                restOperation.statusCode = 200;
                                restOperation.body = {
                                    msg: `package in rpmFile ${rpmFile} installed`
                                };
                                this.completeRestOperation(restOperation);
                            } else {
                                const err = new Error(`package in ${rpmFile} could not be installed`);
                                err.httpStatusCode = 500;
                                restOperation.fail(err);
                            }
                        });
                });
        } catch (err) {
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }

    onPut(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        rpmFile = query.rpmFile;

        const createBody = restOperation.getBody();
        if (createBody.hasOwnProperty('targetHost')) {
            targetHost = createBody.targetHost;
        }
        if (createBody.hasOwnProperty('targetPort')) {
            targetPort = createBody.targetPort;
        }
        if (createBody.hasOwnProperty('rpmFile')) {
            rpmFile = createBody.rpmFile;
        }

        if (!rpmFile) {
            const err = new Error('rpmFile must be defined to install a package');
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

        // query device for extensions
        try {
            this.getExtensions()
                .then((extensions) => {
                    let packageName;
                    extensions.map((extension) => {
                        if (rpmFile.startsWith(extension.packageName)) {
                            packageName = extension.packageName;
                            this.uninstallExtension(packageName)
                                .then((success) => {
                                    if(success) {
                                        this.installExtension(rpmFile)
                                            .then((success) => {
                                                if (success) {
                                                    restOperation.statusCode = 200;
                                                    restOperation.body = {
                                                        msg: `package in rpmFile ${rpmFile} updated`
                                                    };
                                                    this.completeRestOperation(restOperation);
                                                } else {
                                                    const err = new Error(`package in ${rpmFile} could not be updated`);
                                                    err.httpStatusCode = 500;
                                                    restOperation.fail(err);
                                                }
                                            });
                                    } else {
                                        const err = new Error(`package in ${rpmFile} could not be uninstalled to update`);
                                        err.httpStatusCode = 500;
                                        restOperation.fail(err);
                                    }
                                });
                        }
                    });
                    if (!packageName) {
                        const err = new Error(`package with rpmFile ${rpmFile} is not installed to update`);
                        err.httpStatusCode = 409;
                        restOperation.fail(err);
                    }
                });
        } catch (err) {
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }

    onDelete(restOperation) {
        const uri = restOperation.getUri();
        const query = uri.query;

        targetHost = query.targetHost;
        targetPort = query.targetPort;
        name = query.name;

        if (!name) {
            const err = new Error('name query parameter must be defined to uninstall a package');
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

        // query device for extensions
        try {
            this.getExtensions()
                .then((extensions) => {
                    let packageName;
                    extensions.map((extension) => {
                        if (extension.name == name || extension.packageName == name) {
                            packageName = extension.packageName;
                        }
                    });
                    if (packageName) {
                        this.uninstallExtension(packageName)
                            .then((success) => {
                                if (success) {
                                    restOperation.statusCode = 200;
                                    restOperation.body = {
                                        msg: `package ${name} uninstalled`
                                    };
                                    this.completeRestOperation(restOperation);
                                } else {
                                    const err = new Error(`package ${name} could not be uninstalled`);
                                    err.httpStatusCode = 500;
                                    restOperation.fail(err);
                                }
                            });
                    } else {
                        const err = new Error(`package name ${name} could not be uninstalled because it is not installed`);
                        err.httpStatusCode = 404;
                        restOperation.fail(err);
                    }
                });
        } catch (err) {
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }

    getExtensions() {
        return new Promise((resolve) => {
            this.restRequestSender.sendPost(this.getQueryRestOp())
                .then((response) => {
                    let task = response.getBody();
                    if (task.hasOwnProperty('id')) {
                        this.pollTaskUntilFinishedAndDelete(task.id, 10000)
                            .then((extensions) => {
                                resolve(extensions);
                            })
                            .catch((err) => {
                                throw err;
                            });
                    } else {
                        throw new Error('query request did not return a task ID: ' + JSON.stringify(task));
                    }
                })
                .catch((err) => {
                    throw err;
                });
        });
    }

    installExtension(packageName) {
        return new Promise((resolve) => {
            this.restRequestSender.sendPost(this.getInstallRestOp(packageName))
                .then((response) => {
                    let task = response.getBody();
                    if (task.hasOwnProperty('id')) {
                        this.pollTaskUntilFinishedAndDelete(task.id, 10000)
                            .then(() => {
                                resolve(true);
                            })
                            .catch((err) => {
                                throw err;
                            });
                    } else {
                        throw new Error('install request did not return a task ID: ' + JSON.stringify(task));
                    }
                })
                .catch((err) => {
                    throw err;
                });
        });
    }

    uninstallExtension(packageName) {
        return new Promise((resolve) => {
            this.restRequestSender.sendPost(this.getUninstallRestOp(packageName))
                .then((response) => {
                    let task = response.getBody();
                    if (task.hasOwnProperty('id')) {
                        this.pollTaskUntilFinishedAndDelete(task.id, 10000)
                            .then(() => {
                                resolve(true);
                            })
                            .catch((err) => {
                                throw err;
                            });
                    } else {
                        throw new Error('uninstall request did not return a task ID: ' + JSON.stringify(task));
                    }
                })
                .catch((err) => {
                    throw err;
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

    getInstallRestOp(rpmFile) {
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

    pollTaskUntilFinishedAndDelete(taskId, timeout) {
        return new Promise((resolve) => {
            const start = new Date().getTime();
            let stop = start + timeout;
            let returnData = {};

            const poll = () => {
                this.restRequestSender.sendGet(this.getTaskStatusRestOp(taskId))
                    .then((response) => {
                        const queryBody = response.getBody();
                        if (queryBody.hasOwnProperty('status')) {
                            if (queryBody.status === FINISHED) {
                                if (queryBody.hasOwnProperty('queryResponse')) {
                                    returnData = queryBody.queryResponse;
                                } else {
                                    returnData = queryBody;
                                }
                                this.restRequestSender.sendDelete(this.getDeleteTaskRestOp(taskId));
                                resolve(returnData);
                            } else if (queryBody.status === FAILED) {
                                throw new Error('Task failed returning' + queryBody);
                            } else {
                                wait(pollDelay)
                                    .then(() => {
                                        if (new Date().getTime() < stop) {
                                            poll();
                                        } else {
                                            throw new Error('Task did not reach ' + FINISHED + ' status. Instead returned: ' + queryBody);
                                        }
                                    });
                            }
                        }
                    })
                    .catch((err) => {
                        throw err;
                    });
            };

            setImmediate(poll);
        });
    }

}

const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});


module.exports = TrustedExtensionsWorker;