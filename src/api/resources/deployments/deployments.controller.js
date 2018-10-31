import Deployment from './deployments.model';
import Device from '../devices/devices.model';
import devicesController from '../devices/devices.controller';
import devicesServices from '../devices/devices.services';
import extensionsServices from '../extensions/extensions.services';
import {
    isRegExp
} from 'util';

const appconf = require('../../../config/app');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;

export default {
    async createDeployment(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                return await new Promise((resolve) => {
                    const deployment = req.body;
                    try {
                        const deviceIds = [];
                        const extensionIds = [];
                        if (deployment.devices.length > 1) {
                            const addDevicePromises = [];
                            // force a sync between the ASG trusted devices and the application controller
                            devicesServices.updateTrustedDevices()
                                .then(() => {
                                    // foreach device in the application request tell device services to make sure it is trusted
                                    deployment.devices.map((device) => {
                                        if (!device.hasOwnProperty('targetPort')) {
                                            device.targetPort = 443;
                                        }
                                        // note if the device is already in the controller, it just returns, othewise creates a trust
                                        const addDevicePromise = devicesServices.createTrustedDevice(device.targetHost, device.targetPort, device.targetUsername, device.targetPassphrase)
                                            .then((device) => {
                                                deviceIds.push(device.id);
                                            })
                                        addDevicePromises.push(addDevicePromise);
                                    });
                                })
                                .catch((err) => {
                                    throw err;
                                });
                            Promise.all(addDevicePromises)
                                .then(() => {
                                    const addExtensionPromises = [];
                                    if (deployment.hasOwnProperty('extensions') && Array.isArray(deployment.extensions) && deployment.extensions.length > 0) {
                                        deployment.extensions.map((extension) => {
                                            // make sure we have that extension to upload and install
                                            const downloadPromise = extensionsServices.downloadExtensionToStorage(extension.url)
                                                .then((rpmFile) => {
                                                    // loop through and validate extension on requested devices
                                                    deployment.devices.map((device) => {
                                                        const installPromise = extensionsServices.installExtensionOnTrustedDevice(rpmFile, device.targetHost, device.targetPort)
                                                            .then((extension) => {
                                                                extensionIds.push(extension.id);
                                                            })
                                                            .catch((err) => {
                                                                throw err;
                                                            });
                                                        addExtensionPromises.push(installPromise);
                                                    })
                                                })
                                                .catch((err) => {
                                                    throw err;
                                                });
                                            addExtensionPromises.push(downloadPromise);
                                        });
                                    }
                                    Promise.all(addExtensionPromises)
                                        .then(async () => {
                                            const newDeployment = {
                                                "name": deployment.name,
                                                "deviceIds": deviceIds,
                                                "extensionIds": extensionIds
                                            }
                                            const deployment = await Deployment.create(newDeployment);
                                            resolve(res.status(201).json(deployment));
                                        })
                                        .catch((err) => {
                                            throw err;
                                        });
                                })
                                .catch((err) => {
                                    throw err;
                                });
                        } else {
                            const addExtensionPromises = []
                            if (deployment.hasOwnProperty('extensions') && Array.isArray(deployment.extensions) && deployment.extensions.length > 0) {
                                deployment.extensions.map((extension) => {
                                    const downloadPromise = extensionsServices.downloadExtensionToStorage(extension.url)
                                    addExtensionPromises.push(downloadPromise);
                                });
                            }
                            Promise.all(addExtensionPromises)
                                .then(async () => {
                                    const newDeployment = {
                                        "name": deployment.name,
                                        "deviceIds": deviceIds,
                                        "extensionIds": extensionIds
                                    }
                                    const deployment = await Deployment.create(newDeployment);
                                    resolve(res.status(201).json(deployment));
                                })
                                .catch((err) => {
                                    throw err;
                                });
                        }
                    } catch (err) {
                        resolve(res.status(500).json({
                            err: 'error in creating deployemt - ' + err.message
                        }));
                    }
                });
            } else {
                return res.status(403).json({
                    err: 'creating deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                });
            }
        } catch (ex) {
            console.error('error creating deployment: ' + ex);
            return res.status(500).json({
                err: ex
            });
        }
    },
    async findAll(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const {
                    page,
                    perPage
                } = req.query;
                const options = {
                    page: parseInt(page, 10) || 1,
                    limit: parseInt(perPage, 10) || 10
                };
                const deployments = await Deployment.paginate({}, options);
                return res.json(deployments);
            } else {
                return res.status(403).json({
                    err: 'listing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error("Error listing deployments: " + err);
            return res.status(500).jons({
                err: err
            });
        }
    },
    async findById(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const {
                    id
                } = req.params;
                const deployment = await Deployment.findById(id);
                if (!deployment) {
                    return res.status(404).json({
                        err: 'could not find deployment for ID:' + id
                    });
                }
                return res.json(deployment);
            } else {
                return res.status(403).json({
                    err: 'listing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            return res.status(500).json({
                err: err
            });
        }
    },
    async updateDeployment(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const {
                    id
                } = req.params;

                // existing state
                const existingDeployment = await Deployment.findById(id);
                if (!existingDeployment) {
                    return res.status(404).json({
                        err: 'could not find deployment for ID:' + id
                    });
                }

                return await new Promise((resolve) => {
                    // requested state
                    let deployment = req.body;

                    // serialization of workflow
                    const validatePromises = [];
                    const updateExtensionsPromises = [];
                    const updateDevicesPromises = [];
                    const installPromises = [];

                    // algo state
                    let hasErrors = false;
                    const errors = [];
                    const needToAddDevice = [];
                    const needToAddExtension = [];
                    let needToRemoveDeviceById = [];
                    let needToRemoveExtensionById = [];
                    const deviceIdsIndexed = {};
                    const extensionIdsIndexed = {};

                    // return state
                    const returnDeviceIds = [];
                    const returnExtensionIds = [];

                    if (deployment.hasOwnProperty('devices') &&
                        Array.isArray(deployment.devices) && deployment.devices.length > 0) {
                        // requested device is a trusted device and validate if it needs to be added
                        validatePromises.push(deployment.devices.map(async (device) => {
                            if (device.hasOwnProperty('id')) {
                                let knownDevice = await devicesController.getById(device.id)
                                if (!knownDevice) {
                                    hasErrors = true;
                                    errors.push("deployment " + deployment.name + " deviceId " + device.id + " is not a trusted device");
                                } else {
                                    if (!device.id in existingDeployment.deviceIds) {
                                        needToAddDevice.push(knownDevice);
                                    }
                                    deviceIdsIndexed[device.id] = knownDevice;
                                }
                            } else if (device.hasOwnProperty('targetHost')) {
                                if (!device.hasOwnProperty('targetPort')) {
                                    device.targetPort = 443;
                                }
                                let knownDevice = await devicesController.getByTargetHostAndTargetPort(device.targetHost, device.targetPort);
                                if (!knownDevice) {
                                    needToAddDevice.push(device);
                                } else {
                                    if (!knownDevice.id in existingDeployment.deviceIds) {
                                        needToAddDevice.push(knownDevice);
                                    }
                                    deviceIdsIndexed[knownDevice.id] = knownDevice;
                                }
                            } else {
                                hasErrors = true;
                                errors.push("deployment " + deployment.name + " has an invalid device " + JSON.parse(device));
                            }
                        }));
                        // validate if any need to be remove from existing to match request
                        validatePromises.push(existingDeployment.deviceIds.map(async (deviceId) => {
                            if (!deviceId in deviceIdsIndexed) {
                                needToRemoveDeviceById.push(deviceId);
                            }
                        }));
                    } else {
                        // no device Ids specified, we need to remove them all
                        needToRemoveDeviceById = existingDeployment.deviceIds;
                    }
                    if (deployment.hasOwnProperty('extensionIds') &&
                        Array.isArray(deployment.extensions) && deployment.extensions.length > 0) {
                        // check requested extension are validate if it needs to be added
                        validatePromises.push(deployment.extensions.map(async (extension) => {
                            if (extension.hasOwnProperty('id')) {
                                let knownExtension = await extensionsController.getById(extension.id);
                                if (!knownExtension) {
                                    hasErrors = true;
                                    errors.push("deployment " + deployment.name + " extension id " + extension.Id + " is not a known extension");
                                } else {
                                    if (!extension.id in existingDeployment.extensionIds) {
                                        needToAddExtension.push(knownExtension);
                                    }
                                    extensionIdsIndexed[extension.id] = knownExtension;
                                }
                            } else if (extension.hasOwnProperty('url')) {
                                let knownExtension = await extensionsController.getByUrl(extension.url);
                                if (!knownExtension) {
                                    needToAddExtension.push(extension);
                                } else {
                                    if (!knownExtension.id in existingDeployment.extensionIds) {
                                        needToAddExtension.push(knownExtension);
                                    }
                                    extensionIdsIndexed[knownExtension.id] = knownExtension;
                                }
                            } else {
                                hasErrors = true;
                                errors.push("deployment " + deployment.name + " has an invalid extension " + JSON.parse(extension));
                            }
                        }));
                        // validate if any need to be remove from existing to match request
                        validatePromises.push(existingDeployment.extensionIds.map(async (extensionId) => {
                            if (!extensionId in extensionIdsIndexed) {
                                needToRemoveExtensionById.push(extensionId);
                            }
                        }));
                    } else {
                        // no extension Ids specified, we need to remove them all
                        needToRemoveExtensionId = existingDeployment.extensionIds;
                    }
                    // wait for validation to complete
                    Promise.all(validatePromises).then(() => {
                        if (hasErrors) {
                            resolve(res.status(400).json({
                                err: errors
                            }));
                        } else {
                            // figure out the list of extension we need to retain
                            existingDeployment.extensionIds.map((extensionId) => {
                                if (!extensionId in needToRemoveExtensionById) {
                                    returnExtensionIds.push(extensionId);
                                }
                            });
                            //download and add all extension we need to add.

                            needToAddExtension.map((extension) => {
                                if (!extension.hasOwnProperty('id')) {
                                    downloadExtensionPromise = extensionsServices.downloadExtensionToStorage(extension.url)
                                        .then((rpmFile) => {
                                            const knownExtension = extensionsController.getByFilename(rpmFile);
                                            extensionIdsIndexed[knownExtension.id] = knownExtension;
                                            returnExtensionIds.push(knownExtension.id);
                                        })
                                        .catch((err) => {
                                            throw err;
                                        })
                                    updateExtensionsPromises.push(downloadExtensionPromise);
                                }
                            })

                            Promise.all(updateExtensionsPromises)
                            then(() => {
                                    // figure out the list of devices we need to retain.
                                    existingDeployment.deviceIds.map((deviceId) => {
                                        if (!deviceId in needToRemoveDeviceById) {
                                            returnDeviceIds.push(deviceId);
                                        }
                                    })
                                    // create trusts for all devices we need to add
                                    needToAddDevice.map(async (device) => {
                                        if (!device.hasOwnProperty('id')) {
                                            const createDevicePromise = devicesServices.createTrustedDevice(device.targetHost, device.targetPort, device.targetUsername, device.targetPassphrase)
                                                .then((device) => {
                                                    deviceIdsIndexed.push(device.id);
                                                    returnDeviceIds.push(deviceId);
                                                })
                                                .catch((err) => {
                                                    throw err;
                                                });
                                            updateDevicesPromises.push(createDevicePromise);
                                        }
                                    })

                                    Promise.all(updateDevicesPromises)
                                        .then(() => {
                                            // push install of all extensions on all return devices
                                            returnDeviceIds.map((deviceId) => {
                                                const device = deviceIdsIndexed[deviceId];
                                                returnExtensionIds.map((extensionId) => {
                                                    const extension = extensionIdsIndexed[extensionId];
                                                    const installPromise = extensionsServices.installExtensionOnTrustedDevice(extension.filename, device.targetHost, device.targetPort);
                                                    installPromises.push(installPromise);
                                                })
                                            })
                                            // NOTE: WE DO NOT REMOVE EXTENSIONS FROM DEVICES AS WE DON'T KNOW WHAT MIGHT
                                            // HAVE BEEN INSTALLED OUTSIDE OUR PROCESS. LEAVE THEM ALONE!
                                            Promise.all(installPromises)
                                                .then(() => {
                                                    existingDeployment.name = deployment.name;
                                                    existingDeployment.deviceIds = returnDeviceIds;
                                                    existingDeployment.extensionIds = returnExtensionIds;
                                                    existingDeployment.save(function (err) {
                                                        if (err) {
                                                            console.error('error in saving Deployment:' + err.message);
                                                            throw err;
                                                        }
                                                        res.status(200).json(existingDeployment);
                                                    });
                                                })
                                                .catch((err) => {
                                                    throw err;
                                                })
                                        })
                                        .catch((err) => {
                                            throw err;
                                        });
                                })
                                .catch((err) => {
                                    throw err;
                                })
                        }
                    });
                });
            } else {
                return res.status(403).json({
                    err: 'updates to deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                err: err
            });
        }
    },
    async delete(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const {
                    id
                } = req.params;
                console.log('deleting id:' + id);
                const existingDeployment = await Deployment.findByIdAndRemove({
                    _id: id
                });
                if (!user) {
                    return res.status(404).json({
                        err: 'could not find deployment to delete'
                    })
                }
                // figure out what devices trusts to remove from gateway
                // NOTE: WE DO NOT REMOVE EXTENSIONS FROM DEVICES AS WE DON'T KNOW WHAT MIGHT
                // HAVE BEEN INSTALLED OUTSIDE OUR PROCESS. LEAVE THEM ALONE!
                const allExistingDeployments = await Deployment.findAll();
                allExistingDeployments.map((deployment) => {
                    deployment.deviceIds.map((deviceId) => {
                        if(deviceId in existingDeployment.deviceIds) {
                           existingDeployment.deviceIds.filter(id => id !== deviceId);
                        }
                    })
                })
                // remove the trust from the gateway
                return new Promise((resolve) => {
                    const removeDevicePromises = [];
                    existingDeployment.devicesIds.map((deviceId) => {
                        removeDevicePromises.push(new Promise( async (resolve) => {
                            const device = await devicesController.getById(deviceId);
                            devicesServices.removeTrustedDevice(device.targetHost, device.targetPort)
                                .then(() => {
                                    resolve()
                                })
                                .catch((err) => {
                                    throw err;
                                })
                        }));
                    })
                    Promise.all(removeDevicePromises)
                        then(() => {
                            Deployment.findByIdAndRemove({
                                _id: existingDeployment.id
                            }).then(() => {
                                resolve(res.status(200));
                            }).catch((err) => {
                                throw err;
                            })
                        })
                })
            } else {
                return res.status(403).json({
                    err: 'removing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                "err": err
            });
        }
    },
    async get(req, res) {
        try {
            const {
                id
            } = req.params;
            const deployment = await Deployment.findById(id);
            if (!deployment) {
                return res.status(404).json({
                    err: 'could not find deployment for ID:' + id
                });
            }
            const deviceIds = deployment.deviceIds;
            let responses = [];
            const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                try {
                    let request = await devicesController.validateRequest(deviceId, req);
                    if (request.valid) {
                        const proxyResponse = await devicesServices.proxyGet(request.uri, request.targetHost, request.targetPort, req.headers);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.resp.statusCode,
                            responseHeaders: proxyResponse.body.responseHeaders,
                            body: proxyResponse.body.responseBody
                        })
                    } else {
                        responses.push({
                            id: deviceId,
                            status: 400,
                            body: request.reason
                        })
                    }
                } catch (ex) {
                    console.error('error making request to trusted device: ' + deviceId + ' ' + ex);
                    responses.push({
                        id: deviceId,
                        status: 500,
                        body: {
                            err: ex
                        }
                    });
                }
                return
            })
            Promise.all(deviceRequestPromises).then(() => {
                return res.status(200).json(responses);
            })
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                err: err
            });
        }
    },
    async post(req, res) {
        try {
            const {
                id
            } = req.params;
            const deployment = await Deployment.findById(id);
            if (!deployment) {
                return res.status(404).json({
                    err: 'could not find deployment for ID:' + id
                });
            }
            const deviceIds = deployment.deviceIds;
            let responses = [];
            const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                try {
                    let request = await devicesController.validateRequest(deviceId, req);
                    if (request.valid) {
                        const proxyResponse = await devicesServices.proxyPost(request.uri, request.targetHost, request.targetPort, req.headers);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.resp.statusCode,
                            responseHeaders: proxyResponse.body.responseHeaders,
                            body: proxyResponse.body.responseBody
                        })
                    } else {
                        responses.push({
                            id: deviceId,
                            status: 400,
                            body: request.reason
                        })
                    }
                } catch (ex) {
                    console.error('error making request to trusted device: ' + deviceId + ' ' + ex);
                    responses.push({
                        id: deviceId,
                        status: 500,
                        body: {
                            err: ex
                        }
                    });
                }
                return
            })
            Promise.all(deviceRequestPromises).then(() => {
                return res.status(200).json(responses);
            })
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                err: err
            });
        }
    },
    async put(req, res) {
        try {
            const {
                id
            } = req.params;
            const deployment = await Deployment.findById(id);
            if (!deployment) {
                return res.status(404).json({
                    err: 'could not find deployment for ID:' + id
                });
            }
            const deviceIds = deployment.deviceIds;
            let responses = [];
            const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                try {
                    let request = await devicesController.validateRequest(deviceId, req);
                    if (request.valid) {
                        const proxyResponse = await devicesServices.proxyPut(request.uri, request.targetHost, request.targetPort, req.headers);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.resp.statusCode,
                            responseHeaders: proxyResponse.body.responseHeaders,
                            body: proxyResponse.body.responseBody
                        })
                    } else {
                        responses.push({
                            id: deviceId,
                            status: 400,
                            body: request.reason
                        })
                    }
                } catch (ex) {
                    console.error('error making request to trusted device: ' + deviceId + ' ' + ex);
                    responses.push({
                        id: deviceId,
                        status: 500,
                        body: {
                            err: ex
                        }
                    });
                }
                return
            })
            Promise.all(deviceRequestPromises).then(() => {
                return res.status(200).json(responses);
            })
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                err: err
            });
        }
    },
    async patch(req, res) {
        try {
            const {
                id
            } = req.params;
            const deployment = await Deployment.findById(id);
            if (!deployment) {
                return res.status(404).json({
                    err: 'could not find deployment for ID:' + id
                });
            }
            const deviceIds = deployment.deviceIds;
            let responses = [];
            const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                try {
                    let request = await devicesController.validateRequest(deviceId, req);
                    if (request.valid) {
                        const proxyResponse = await devicesServices.proxyPatch(request.uri, request.targetHost, request.targetPort, req.headers);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.resp.statusCode,
                            responseHeaders: proxyResponse.body.responseHeaders,
                            body: proxyResponse.body.responseBody
                        })
                    } else {
                        responses.push({
                            id: deviceId,
                            status: 400,
                            body: request.reason
                        })
                    }
                } catch (ex) {
                    console.error('error making request to trusted device: ' + deviceId + ' ' + ex);
                    responses.push({
                        id: deviceId,
                        status: 500,
                        body: {
                            err: ex
                        }
                    });
                }
                return
            })
            Promise.all(deviceRequestPromises).then(() => {
                return res.status(200).json(responses);
            })
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                err
            });
        }
    },
    async del(req, res) {
        try {
            const {
                id
            } = req.params;
            const deployment = await Deployment.findById(id);
            if (!deployment) {
                return res.status(404).json({
                    err: 'could not find deployment for ID:' + id
                });
            }
            const deviceIds = deployment.deviceIds;
            let responses = [];
            const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                try {
                    let request = await devicesController.validateRequest(deviceId, req);
                    if (request.valid) {
                        const proxyResponse = await devicesServices.proxyDelete(request.uri, request.targetHost, request.targetPort, req.headers);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.resp.statusCode,
                            responseHeaders: proxyResponse.body.responseHeaders,
                            body: proxyResponse.body.responseBody
                        })
                    } else {
                        responses.push({
                            id: deviceId,
                            status: 400,
                            body: request.reason
                        })
                    }
                } catch (ex) {
                    console.error('error making request to trusted device: ' + deviceId + ' ' + ex);
                    responses.push({
                        id: deviceId,
                        status: 500,
                        body: {
                            err: ex
                        }
                    });
                }
                return
            })
            Promise.all(deviceRequestPromises).then(() => {
                return res.status(200).json(responses);
            })
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                err: err
            });
        }
    }
};