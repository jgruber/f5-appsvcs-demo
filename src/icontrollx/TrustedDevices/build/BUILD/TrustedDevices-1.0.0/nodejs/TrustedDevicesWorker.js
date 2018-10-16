"use strict";

const fs = require("fs");
const deviceGroupsUrl = 'http://localhost:8100/mgmt/shared/resolver/device-groups';
const ACTIVE = 'ACTIVE';
const UNDISCOVERED = 'UNDISCOVERED';

/**
 * return back the ASG machine ID
 * @returns string machine UUID
 */
const getASGMachineId = () => {
    return String(fs.readFileSync('/machineId', 'utf8')).replace(/[^ -~]+/g, "");
};

/**
 * delay timer
 * @returns Promise which resolves after timer expires
 */
const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms)
});

/**
 * Trusted Device Controller
 * @constructor
 */
class TrustedDevicesWorker {

    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedDevices";
        this.isPublic = true;
    }

    /**
     * Request to create the well known device group on the ASG
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    createDeviceGroup() {
        return new Promise((resolve) => {
            const createBody = {
                "groupName": "dockerContainers",
                "display": "API Gateway Trust Group",
                "description": "API Gateway Trust Group"
            };
            const deviceGroupsPostRequest = this.restOperationFactory.createRestOperationInstance()
                .setUri(this.url.parse(deviceGroupsUrl))
                .setBody(createBody);
            this.restRequestSender.sendPost(deviceGroupsPostRequest)
                .then((response) => {
                    resolve(response);
                })
                .catch(err => {
                    throw err;
                });
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
                        // we need to create a device group for our desired devices
                        Promise.all([this.createDeviceGroup()])
                            .then(() => {
                                resolve([{
                                    groupName: 'dockerContainers'
                                }]);
                            })
                            .catch(err => {
                                this.logger.severe('could not create device group');
                                throw err;
                            });
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
     * Assures devices are in the well know device group on the ASG
     * @param List of device objects to add to the device group
     * @returns Promise when assurance completes
     * @throws Error if assurance fails
     */
    addDevices(devicesToAdd) {
        return new Promise((resolve) => {
            if (devicesToAdd.length > 0) {
                this.getDeviceGroups()
                    .then((deviceGroups) => {
                        const devicesUrl = deviceGroupsUrl + '/dockerContainers/devices';
                        const addPromises = [];
                        devicesToAdd.map((device) => {
                            // build a request to get device groups
                            const createBody = {
                                "userName": device.targetUsername,
                                "password": device.targetPassphrase,
                                "address": device.targetHost,
                                "httpsPort": device.targetPort
                            };
                            const devicePostRequest = this.restOperationFactory.createRestOperationInstance()
                                .setUri(this.url.parse(devicesUrl))
                                .setBody(createBody);
                            this.logger.info('adding ' + device.targetHost + ':' + device.targetPort + ' from device group on ASG');
                            addPromises.push(this.restRequestSender.sendPost(devicePostRequest));
                        });
                        Promise.all(addPromises)
                            .then(() => {
                                wait(500).then(() => {
                                    resolve();
                                })
                            })
                            .catch(err => {
                                throw err;
                            });
                    });
            } else {
                resolve();
            }
        });
    }

    /**
     * Assures devices are no longer trusted or trust the ASG
     * @param List of device objects to remove trust
     * @returns Promise when assurance completes
     * @throws Error if assurance fails
     */
    removeDevices(devicesToRemove) {
        return new Promise((resolve) => {
            if (devicesToRemove.length > 0) {
                const deletePromises = [];
                const asgMachineId = getASGMachineId();
                devicesToRemove.map((device) => {
                    if (device.isBigIP) {
                        // While the trust is still established, remove the ASG certificate
                        // from the trusted device. Then after, remove the device from the ASG.
                        this.removeCertificateFromTrustedDevice(device, asgMachineId)
                            .then(() => {
                                // Remove the trusted device certificate if it registered properly.
                                if (device.hasOwnProperty('machineId')) {
                                    deletePromises.push(this.removeCertificateFromASG(device.machineId));
                                }
                            })
                            .catch((err) => {
                                this.logger.severe('could not remove ASG certificate from trusted device.')
                                throw err;
                            })
                    }
                    // Remove the trusted device from the device group.
                    deletePromises.push(this.removeDevice(device));
                });
                Promise.all(deletePromises)
                    .then(() => {
                        resolve();
                    })
                    .catch((err) => {
                        this.logger.severe('could not remove trusted device from the ASG')
                        throw err;
                    });
            } else {
                resolve();
            }
        });
    }

    /**
     * Assures no devices are trusted or trust the ASG
     * @returns Promise when assurance completes
     * @throws Error if assurance fails
     */
    removeAllDevices() {
        return new Promise((resolve) => {
            this.getDevices(true)
                .then((devices) => {
                    if (devices.length > 0) {
                        const deletePromises = [];
                        const asgMachineId = getASGMachineId();
                        devices.map((device) => {
                            if (device.isBigIP) {
                                // While the trust is still established, remove the ASG certificate
                                // from the trusted device. Then after, remove the device from the ASG.
                                this.removeCertificateFromTrustedDevice(device, asgMachineId)
                                    .then(() => {
                                        // Remove the trusted device certificate if it registered properly.
                                        if (device.hasOwnProperty('machineId')) {
                                            deletePromises.push(this.removeCertificateFromASG(device.machineId));
                                        }
                                    })
                                    .catch((err) => {
                                        this.logger.severe('could not remove ASG certificate from trusted device.')
                                        throw err;
                                    })
                            }
                            // Remove the trusted device from the device group.
                            deletePromises.push(this.removeDevice(device));
                        });
                        Promise.all(deletePromises)
                            .then(() => {
                                resolve();
                            })
                            .catch((err) => {
                                throw err;
                            });
                    } else {
                        resolve();
                    }
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
     * Request to remove a device from the well known device group on the ASG
     * @param the device to remove
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    removeDevice(device) {
        return new Promise((resolve) => {
            this.logger.info('removing ' + device.targetHost + ':' + device.targetPort + ' from device group on ASG');
            const deviceDeleteRequest = this.restOperationFactory.createRestOperationInstance()
                .setUri(this.url.parse(device.url))
                .setReferer(this.getUri().href);
            this.restRequestSender.sendDelete(deviceDeleteRequest)
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    this.logger.severe('Error remove device from device group:' + err.message);
                    throw err;
                });
        });
    }

    /**
     * Request to remove a device certificate by its machineId from a trusted device
     * @param the trusted device to remove certificate
     * @param the machineId used to identifiy the certificate to remove
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    removeCertificateFromTrustedDevice(device, machineId) {
        return new Promise((resolve) => {
            this.logger.info('removing certificate for machineId: ' + machineId + ' from device ' + device.targetHost + ':' + device.targetPort);
            const certPath = '/mgmt/shared/device-certificates';
            const certUrl = 'https://' + device.targetHost + ":" + device.targetPort + certPath;
            const certGetRequest = this.restOperationFactory.createRestOperationInstance()
                .setIdentifiedDeviceRequest(true)
                .setUri(this.url.parse(certUrl))
                .setReferer(this.getUri().href);
            const certificateGetPromise = this.restRequestSender.sendGet(certGetRequest)
                .then((response) => {
                    const certsBody = response.getBody();
                    if (certsBody.hasOwnProperty('items')) {
                        const certs = certsBody.items;
                        certs.map((cert) => {
                            if (cert.machineId == machineId) {
                                const certDelUrl = certUrl + '/' + cert.certificateId;
                                const certDelRequest = this.restOperationFactory.createRestOperationInstance()
                                    .setIdentifiedDeviceRequest(true)
                                    .setUri(this.url.parse(certDelUrl))
                                    .setReferer(this.getUri().href);
                                const certDeletePromise = this.restRequestSender.sendDelete(certDelRequest)
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((err) => {
                                        this.logger.severe('Error deleting certificate from remote device:' + err.message);
                                        throw err;
                                    });
                                Promise.all([certDeletePromise])
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((err) => {
                                        throw err;
                                    });
                            }
                        });
                    }
                    resolve();
                })
                .catch((err) => {
                    this.logger.severe('Error getting certificates from remote device:' + err.message);
                    throw err;
                });
            Promise.all([certificateGetPromise])
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    throw err;
                });
        });
    }

    /**
     * Request to remove a device certificate by its machineId from the ASG
     * @param the machineId used to identifiy the certificate to remove
     * @returns Promise when request completes
     * @throws Error if request fails
     */
    removeCertificateFromASG(machineId) {
        return new Promise((resolve) => {
            this.logger.info('removing certificate for machineId: ' + machineId + ' from ASG');
            const certUrl = 'http://localhost:8100/mgmt/shared/device-certificates';
            const certGetRequest = this.restOperationFactory.createRestOperationInstance()
                .setUri(this.url.parse(certUrl))
                .setReferer(this.getUri().href);
            const certificateGetPromise = this.restRequestSender.sendGet(certGetRequest)
                .then((response) => {
                    const certsBody = response.getBody();
                    if (certsBody.hasOwnProperty('items')) {
                        const certs = certsBody.items;
                        certs.map((cert) => {
                            if (cert.machineId == machineId) {
                                const certDelUrl = certUrl + '/' + cert.certificateId;
                                const certDelRequest = this.restOperationFactory.createRestOperationInstance()
                                    .setIdentifiedDeviceRequest(true)
                                    .setUri(this.url.parse(certDelUrl))
                                    .setReferer(this.getUri().href);
                                const certDeletePromise = this.restRequestSender.sendDelete(certDelRequest);
                                certDeletePromise
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((err) => {
                                        this.logger.severe('Error deleting certificate from ASG:' + err.message);
                                        throw err;
                                    });
                                Promise.all([certDeletePromise])
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((err) => {
                                        throw err;
                                    });
                            }
                        });
                    }
                    resolve();
                })
                .catch((err) => {
                    this.logger.severe('Error getting certificates from ASG:' + err.message);
                    throw err;
                });
            Promise.all([certificateGetPromise])
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    throw err;
                });
        });
    }

    /**
     * handle onGet HTTP request to get trusted devices
     * @param {Object} restOperation
     */
    onGet(restOperation) {
        try {
            this.getDevices()
                .then((devices) => {
                    restOperation.statusCode = 200;
                    restOperation.body = {
                        devices: devices
                    };
                    this.completeRestOperation(restOperation);
                })
                .catch((err) => {
                    throw err;
                });
        } catch (err) {
            this.logger.severe("GET request to retrieve trusted devices failed: \n%s", err);
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }

    /**
     * handle onPost HTTP request
     * @param {Object} restOperation - body is the declared devices to trust
     */
    onPost(restOperation) {
        try {
            // get the post body from the request
            const declaration = restOperation.getBody();
            if (!declaration || !declaration.hasOwnProperty('devices')) {
                // there was no declaration body submitted, return an error
                const err = new Error();
                err.message = 'declaration missing';
                err.httpStatusCode = 400;
                this.logger.severe("POST request to trusted devices failed: declaration missing");
                restOperation.fail(err);
            }
            const desiredDevices = declaration.devices;

            if (desiredDevices.length > 0) {
                // Create comparison collections.
                const desiredDeviceDict = {};
                const existingDeviceDict = {};
                // Populate desired comparison collection with targetHost:targetPort as the key.
                desiredDevices.map((device) => {
                    if (!device.hasOwnProperty('targetPort')) {
                        device.targetPort = 443;
                    }
                    desiredDeviceDict[device.targetHost + ":" + device.targetPort] = device;
                });
                try {
                    this.getDevices(true)
                        .then((existingDevices) => {
                            // Populate existing comparison collection with targetHost:targetPort as the key.
                            existingDevices.map((device) => {
                                existingDeviceDict[device.targetHost + ":" + device.targetPort] = device;
                            });
                            for (let device in desiredDeviceDict) {
                                if (existingDeviceDict.hasOwnProperty(device)) {
                                    if (existingDeviceDict[device].state === ACTIVE) {
                                        // Device is desired, exists already, and is active. Don't remove it.
                                        existingDevices.pop(existingDeviceDict[device]);
                                        // Device is desired, exists alerady, and is active. Don't add it.
                                        desiredDevices.pop(desiredDeviceDict[device]);
                                    } else {
                                        // Device is desired, exists already, but trust is not active. Reset it.
                                        this.logger.info('resetting ' + device.targetHost + ':' + device.targetPort + ' because its state is:' + device.state);
                                    }
                                } else {
                                    // Assure that the device declaration has the needed attributed to add.
                                    if (!desiredDeviceDict[device].hasOwnProperty('targetUsername') ||
                                        !desiredDeviceDict[device].hasOwnProperty('targetPassphrase')) {
                                        const err = new Error();
                                        err.message = 'declared device missing targetUsername or targetPassphrase';
                                        err.httpStatusCode = 400;
                                        restOperation.fail(err);
                                    }
                                }
                            }
                            // Serially remove devices not desired in the declaration.
                            Promise.all([this.removeDevices(existingDevices)])
                                .then(() => {
                                    Promise.all([this.addDevices(desiredDevices)])
                                        .then(() => {
                                            // Get the list of currently trusted devices as 
                                            // the response to our declaration.
                                            this.getDevices()
                                                .then((devices) => {
                                                    restOperation.statusCode = 200;
                                                    restOperation.body = {
                                                        devices: devices
                                                    };
                                                    this.completeRestOperation(restOperation);
                                                })
                                                .catch((err) => {
                                                    this.logger.severe('Error returning list of devices:' + err.message);
                                                    throw err;
                                                });
                                        });
                                })
                                .catch((err) => {
                                    throw err;
                                })
                        })
                } catch (err) {
                    this.logger.severe("POST request to trusted devices failed:" + err.message);
                    restOperation.fail(err);
                }
            } else {
                // There are no desired deviecs. Remove all existing trusted devices.
                this.removeAllDevices()
                    .then(() => {
                        // Get the list of currently trusted devices as 
                        // the response to our declaration.
                        this.getDevices()
                            .then((devices) => {
                                restOperation.statusCode = 200;
                                restOperation.body = {
                                    devices: devices
                                };
                                this.completeRestOperation(restOperation);
                            })
                            .catch((err) => {
                                this.logger.severe('Error returning list of devices:' + err.message);
                                throw err;
                            });
                    })
                    .catch((err) => {
                        this.logger.severe('Error removing all trusted devices:' + err.message);
                        throw err;
                    });
            }
        } catch (err) {
            this.logger.severe("POST request to update trusted devices failed: \n%s", err);
            err.httpStatusCode = 400;
            restOperation.fail(err);
        }
    }
}

module.exports = TrustedDevicesWorker;