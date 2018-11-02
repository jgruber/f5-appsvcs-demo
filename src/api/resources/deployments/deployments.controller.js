import Deployment from './deployments.model';
import devicesController from '../devices/devices.controller';
import devicesServices from '../devices/devices.services';
import extensionsController from "../extensions/extensions.controller";
import extensionsServices from '../extensions/extensions.services';

const appconf = require('../../../config/app');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;

const extendedOutput = async (deployment) => {
    const dataPromises = []
    const devices = [];
    const extensions = [];
    if ('deviceIds' in deployment) {
        deployment.deviceIds.map((deviceId) => {
            dataPromises.push(
                devicesController.getById(deviceId)
                .then((device) => {
                    devices.push(device);
                })
            )
        });
    }
    if ('extensionIds' in deployment) {
        deployment.extensionIds.map((extensionId) => {
            dataPromises.push(
                extensionsController.getById(extensionId)
                .then((extension) => {
                    extensions.push(extension);
                })
            )
        });
    }
    await Promise.all(dataPromises);
    return {
        "id": deployment.id,
        "name": deployment.name,
        "devices": devices,
        "extensions": extensions
    };
}

export default {
    async createDeployment(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                try {
                    const deployment = req.body;
                    const existingDeployment = await Deployment.find({
                        name: deployment.name
                    })
                    if (existingDeployment.length > 0) {
                        const error = 'a deployment with name: ' + existingDeployment[0].name + ' already exists with id: ' + existingDeployment[0].id;
                        return res.status(409).json({
                            err: error
                        })
                    }
                    const deviceIds = [];
                    const extensionIds = [];
                    if ('devices' in deployment && deployment.devices.length > 0) {
                        const addDevicePromises = [];
                        // force a sync between the ASG trusted devices and the application controller
                        await devicesServices.updateTrustedDevices()
                        deployment.devices.map((device) => {
                            addDevicePromises.push(new Promise((resolve) => {
                                if (!('targetPort' in device)) {
                                    device.targetPort = 443;
                                }
                                // note if the device is already in the controller, it just returns, othewise creates a trust
                                const addDevicePromise = devicesServices.createTrustedDevice(device.targetHost, device.targetPort, device.targetUsername, device.targetPassphrase)
                                    .then((device) => {
                                        deviceIds.push(device.id);
                                        resolve();
                                    })
                                addDevicePromises.push(addDevicePromise);
                            }));
                        });
                        await Promise.all(addDevicePromises)
                        const addExtensionPromises = [];
                        if ('extensions' in deployment && Array.isArray(deployment.extensions) && deployment.extensions.length > 0) {
                            deployment.extensions.map((extension) => {
                                addExtensionPromises.push(new Promise((resolve) => {
                                    // make sure we have that extension to upload and install
                                    extensionsServices.downloadExtensionToStorage(extension.url)
                                        .then((rpmFile) => {
                                            // loop through and validate extension on requested devices
                                            const installPromises = []
                                            deployment.devices.map((device) => {
                                                installPromises.push(new Promise((resolve => {
                                                    extensionsServices.installExtensionOnTrustedDevice(rpmFile, device.targetHost, device.targetPort)
                                                        .then(() => {
                                                            extensionsController.getByFilename(rpmFile)
                                                                .then((extension) => {
                                                                    if (!(extensionIds.includes(extension.id))) {
                                                                        extensionIds.push(extension.id);
                                                                    }
                                                                    resolve();
                                                                })
                                                        })
                                                        .catch((err) => {
                                                            throw err;
                                                        });
                                                })));
                                            })
                                            Promise.all(installPromises)
                                                .then(() => {
                                                    resolve()
                                                })
                                        })
                                        .catch((err) => {
                                            throw err;
                                        });
                                }));
                            });
                        }
                        await Promise.all(addExtensionPromises)
                        const newDeployment = {
                            "name": deployment.name,
                            "deviceIds": deviceIds,
                            "extensionIds": extensionIds
                        }
                        const returnDeployment = await Deployment.create(newDeployment)
                        return res.status(201).json(await extendedOutput(returnDeployment));
                    } else {
                        const addExtensionPromises = []
                        if ('extensions' in deployment && Array.isArray(deployment.extensions) && deployment.extensions.length > 0) {
                            deployment.extensions.map((extension) => {
                                const downloadPromise = extensionsServices.downloadExtensionToStorage(extension.url)
                                addExtensionPromises.push(downloadPromise);
                            });
                        }
                        await Promise.all(addExtensionPromises)
                        const returnDeployment = await Deployment.create(newDeployment)
                        return res.status(201).json(await extendedOutput(returnDeployment));
                    }
                } catch (err) {
                    return res.status(500).json({
                        err: 'error in creating deploymet - ' + err.message
                    })
                }
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
                const newdocs = [];
                for (let i = 0; i < deployments.docs.length; i++) {
                    newdocs.push(await extendedOutput(deployments.docs[i]));
                }
                deployments.docs = newdocs;
                return res.json(deployments);
            } else {
                return res.status(403).json({
                    err: 'listing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error("Error listing deployments: " + err);
            return res.status(500).json({
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
                return res.json(await extendedOutput(deployment));
            } else {
                return res.status(403).json({
                    err: 'listing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            return res.status(500).json({
                err: err.message
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

                //return await new Promise(async (resolve) => {
                // requested state
                let deployment = req.body;

                // serialization of workflow
                const createPromises = [];
                const removeDevicePromises = [];
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

                if ('devices' in deployment && Array.isArray(deployment.devices) && deployment.devices.length > 0) {
                    const inventoryDevicesPromises = [];
                    // requested device is a trusted device and validate if it needs to be added
                    deployment.devices.map((device) => {
                        const deviceInventoryPromise = new Promise((resolve) => {
                            if ('id' in device) {
                                devicesController.getById(device.id)
                                    .then((knownDevice) => {
                                        if (!knownDevice) {
                                            hasErrors = true;
                                            errors.push("deployment " + deployment.name + " deviceId " + device.id + " is not a trusted device");
                                        } else {
                                            deviceIdsIndexed[device.id] = knownDevice;
                                            if (!device.id in existingDeployment.deviceIds) {
                                                needToAddDevice.push(knownDevice);
                                            }
                                        }
                                        resolve();
                                    })
                            } else if ('targetHost' in device) {
                                if (!('targetPort' in device)) {
                                    device.targetPort = 443;
                                }
                                devicesController.getByTargetHostAndTargetPort(device.targetHost, device.targetPort)
                                    .then((knownDevice) => {
                                        if (!knownDevice) {
                                            needToAddDevice.push(device);
                                        } else {
                                            deviceIdsIndexed[knownDevice.id] = knownDevice;
                                            if (!(existingDeployment.deviceIds.includes(knownDevice.id))) {
                                                needToAddDevice.push(knownDevice);
                                            }
                                        }
                                        resolve();
                                    });

                            } else {
                                hasErrors = true;
                                errors.push("deployment " + deployment.name + " has an invalid device " + JSON.parse(device));
                                resolve();
                            }
                        })
                        inventoryDevicesPromises.push(deviceInventoryPromise);
                    });
                    await Promise.all(inventoryDevicesPromises);
                    if ('deviceIds' in existingDeployment) {
                        // validate if any need to be remove from existing to match request
                        existingDeployment.deviceIds.map((deviceId) => {
                            if (!(deviceId in deviceIdsIndexed)) {
                                needToRemoveDeviceById.push(deviceId);
                            }
                        })
                    }
                } else {
                    for (let i = 0; i < existingDeployment.deviceIds.length; i++) {
                        deviceIdsIndexed[existingDeployment.deviceIds[i]] = await devicesController.getById(existingDeployment.deviceIds[i]);
                    }
                    // no device Ids specified, we need to remove them all
                    needToRemoveDeviceById = existingDeployment.deviceIds;
                }
                // figure out the list of devices we need to retain.
                if ('deviceIds' in existingDeployment) {
                    existingDeployment.deviceIds.map((deviceId) => {
                        if (!(needToRemoveDeviceById.includes(deviceId))) {
                            returnDeviceIds.push(deviceId);
                        }
                    })
                }
                // create trusts for all devices we need to add
                needToAddDevice.map(async (device) => {
                    const createDevicePromise = devicesServices.createTrustedDevice(device.targetHost, device.targetPort, device.targetUsername, device.targetPassphrase)
                        .then((device) => {
                            deviceIdsIndexed[device.id] = device;
                            returnDeviceIds.push(device.id);
                        })
                        .catch((err) => {
                            throw err;
                        });
                    createPromises.push(createDevicePromise);
                })

                if ('extensions' in deployment && Array.isArray(deployment.extensions) && deployment.extensions.length > 0) {
                    const inventoryExtensionsPromises = [];
                    // check requested extension are validate if it needs to be added
                    deployment.extensions.map((extension) => {
                        const extensionInventoryPromise = new Promise((resolve) => {
                            if ('id' in extension) {
                                extensionsController.getById(extension.id)
                                    .then((knownExtension) => {
                                        if (!knownExtension) {
                                            hasErrors = true;
                                            errors.push("deployment " + deployment.name + " extension id " + extension.Id + " is not a known extension");
                                        } else {
                                            if (!extension.id in existingDeployment.extensionIds) {
                                                needToAddExtension.push(knownExtension);
                                            }
                                            extensionIdsIndexed[extension.id] = knownExtension;
                                        }
                                        resolve();
                                    });
                            } else if ('url' in extension) {
                                extensionsController.getByUrl(extension.url)
                                    .then((knownExtension) => {
                                        if (!knownExtension) {
                                            needToAddExtension.push(extension);
                                        } else {
                                            if (!existingDeployment.extensionIds.includes(knownExtension.id)) {
                                                needToAddExtension.push(knownExtension);
                                            }
                                            extensionIdsIndexed[knownExtension.id] = knownExtension;
                                        }
                                        resolve();
                                    });
                            } else {
                                hasErrors = true;
                                errors.push("deployment " + deployment.name + " has an invalid extension " + JSON.parse(extension));
                                resolve();
                            }
                        })
                        inventoryExtensionsPromises.push(extensionInventoryPromise);
                    })
                    await Promise.all(inventoryExtensionsPromises);
                    if ('extensionIds' in existingDeployment) {
                        // validate if any need to be remove from existing to match request
                        existingDeployment.extensionIds.map((extensionId) => {
                            if (!extensionId in extensionIdsIndexed) {
                                needToRemoveExtensionById.push(extensionId);
                            }
                        })
                    }
                } else {
                    // no extension Ids specified, we need to remove them all
                    for (let i = 0; i < existingDeployment.extensionIds.length; i++) {
                        extensionIdsIndexed[existingDeployment.extensionIds[i]] = await extensionsController.getById(existingDeployment.extensionIds[i]);
                    }
                    needToRemoveExtensionById = existingDeployment.extensionIds;
                }
                // figure out the list of extension we need to retain
                if ('extensionIds' in existingDeployment) {
                    existingDeployment.extensionIds.map((extensionId) => {
                        if (!(needToRemoveExtensionById.includes(extensionId))) {
                            returnExtensionIds.push(extensionId);
                        }
                    });
                }

                //download and extensions we need.
                needToAddExtension.map(async (extension, idx) => {
                    const downloadExtensionPromise = extensionsServices.downloadExtensionToStorage(extension.url)
                        .then((rpmFile) => {
                            const queryExtensionPromise = extensionsController.getByFilename(rpmFile)
                                .then((knownExtension) => {
                                    extensionIdsIndexed[knownExtension.id] = knownExtension;
                                    returnExtensionIds.push(knownExtension.id);
                                });
                            createPromises.push(queryExtensionPromise);
                        })
                        .catch((err) => {
                            throw err;
                        })
                    createPromises.push(downloadExtensionPromise);
                })
                await Promise.all(createPromises);

                //are the devices we would remove in other deployments?
                const extensionsToRemainByDeviceId = {}
                const allExistingDeployments = await Deployment.find();
                allExistingDeployments.map((deployment) => {
                    deployment.deviceIds.map((deviceId) => {
                        if (needToRemoveDeviceById.includes(deviceId)) {
                            needToRemoveDeviceById.filter(id => id !== deviceId);
                        }
                        extensionsToRemainByDeviceId[deviceId] = deployment.extensionIds;
                    })
                })

                // remove the installed extension, trust from the gateway
                if ('deviceIds' in existingDeployment) {
                    needToRemoveDeviceById.map((deviceId) => {
                        const getDevicePromise = devicesController.getById(deviceId)
                            .then((device) => {
                                if (device) {
                                    const uninstallExtensionPromises = []
                                    needToRemoveExtensionById.map((extensionId) => {
                                        console.log(extensionId);
                                        const extension = extensionIdsIndexed[extensionId];
                                        console.log('uninstalling on device ' + device.targetHost + ':' + device.targetPort + ' extension: ' + JSON.stringify(extension));
                                        const uninstallExtensionPromise = extensionsServices.uninstallExtensionOnTrustedDevice(extension.filename, device.targetHost, device.targetPort);
                                        uninstallExtensionPromises.push(uninstallExtensionPromise);
                                        removeDevicePromises.push(uninstallExtensionPromise);
                                    })
                                    Promise.all(uninstallExtensionPromises)
                                        .then(() => {
                                            const removeDevicePromise = devicesServices.removeTrustedDevice(device.targetHost, device.targetPort)
                                            removeDevicePromises.push(removeDevicePromise);
                                        })
                                }
                            })
                            .catch((err) => {
                                throw err;
                            });
                        removeDevicePromises.push(getDevicePromise);
                    })
                }
                await Promise.all(removeDevicePromises)
                await extensionsController.trimToActiveDevices();

                // push install of all extensions on all return devices
                returnDeviceIds.map((deviceId) => {
                    const device = deviceIdsIndexed[deviceId];
                    const deviceInstallPromise = devicesServices.createTrustedDevice(device.targetHost, device.targetPort, device.targetUsername, device.targetPassphrase)
                        .then(() => {
                            returnExtensionIds.map((extensionId) => {
                                const extension = extensionIdsIndexed[extensionId];
                                console.log('installing extension ' + extension.filename + ' on ' + device.targetHost + ':' + device.targetPort);
                                const extensionInstallPromise = extensionsServices.installExtensionOnTrustedDevice(extension.filename, device.targetHost, device.targetPort);
                                installPromises.push(extensionInstallPromise);
                            })
                        })
                    installPromises.push(deviceInstallPromise)
                })
                await Promise.all(installPromises)
                existingDeployment.name = deployment.name;
                existingDeployment.deviceIds = returnDeviceIds;
                existingDeployment.extensionIds = returnExtensionIds;
                await existingDeployment.save((err) => {
                    if (err) {
                        console.error('error in saving Deployment:' + err.message);
                        throw err;
                    }
                });
                return res.status(200).json(await extendedOutput(existingDeployment));
                // });
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
                const existingDeployment = await Deployment.findById({
                    _id: id
                });
                if (!existingDeployment) {
                    return res.status(404).json({
                        err: 'could not find deployment to delete'
                    })
                }
                // figure out what devices trusts to remove from gateway
                const allExistingDeployments = await Deployment.find();
                allExistingDeployments.map((deployment) => {
                    deployment.deviceIds.map((deviceId) => {
                        if (existingDeployment.deviceIds.includes(deviceId)) {
                            existingDeployment.deviceIds.filter(id => id !== deviceId);
                        }
                    })
                })
                if (!('deviceIds' in existingDeployment)) {
                    existingDeployment.deviceIds = [];
                }
                if (!('extensionIds' in existingDeployment)) {
                    existingDeployment.extensionIds = [];
                }

                // remove the trust from the gateway
                const uninstallExtensionPromises = [];
                const deviceIndexById = {};
                existingDeployment.deviceIds.map((deviceId) => {
                    const getDevicePromise = devicesController.getById(deviceId)
                        .then((device) => {
                            if (device) {
                                deviceIndexById[device.id] = device;
                                existingDeployment.extensionIds.map((extensionId) => {
                                    const uninstallExtensionPromise = new Promise((resolve) => {
                                        extensionsController.getById(extensionId)
                                            .then((extension) => {
                                                console.log('uninstalling extension ' + extension.filename + ' from ' + device.targetHost + ':' + device.targetPort);
                                                extensionsServices.uninstallExtensionOnTrustedDevice(extension.filename, device.targetHost, device.targetPort)
                                                    .then((success) => {
                                                        console.log('extension uninstalled from ' + device.targetHost + ':' + device.targetPort);
                                                        resolve(success);
                                                    })
                                            })
                                    });
                                    uninstallExtensionPromises.push(uninstallExtensionPromise);
                                });
                            }
                        })
                        .catch((err) => {
                            throw err;
                        });
                    uninstallExtensionPromises.push(getDevicePromise);
                });
                await Promise.all(uninstallExtensionPromises)
                const removeDevicePromises = [];
                console.log('ext should be gone');
                existingDeployment.deviceIds.map((deviceId) => {
                    removeDevicePromises.push(new Promise((resolve) => {
                        const device = deviceIndexById[deviceId];
                        if (device) {
                            console.log('uninstalling device ' + device.targetHost);
                            devicesServices.removeTrustedDevice(device.targetHost, device.targetPort)
                                .then(() => {
                                    resolve()
                                })
                        }
                    }));
                });
                await Promise.all(removeDevicePromises)
                await Deployment.findByIdAndRemove({
                    _id: existingDeployment.id
                })
                extensionsController.trimToActiveDevices();
                return res.status(200).send();

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
                            status: proxyResponse.status,
                            responseHeaders: proxyResponse.headers,
                            body: proxyResponse.body
                        });
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
                        const proxyResponse = await devicesServices.proxyPost(request.uri, request.targetHost, request.targetPort, req.headers, req.body);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.status,
                            responseHeaders: proxyResponse.headers,
                            body: proxyResponse.body
                        });
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
                        const proxyResponse = await devicesServices.proxyPut(request.uri, request.targetHost, request.targetPort, req.headers, req.body);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.status,
                            responseHeaders: proxyResponse.headers,
                            body: proxyResponse.body
                        });
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
                        const proxyResponse = await devicesServices.proxyPatch(request.uri, request.targetHost, request.targetPort, req.headers, req.body);
                        responses.push({
                            id: deviceId,
                            status: proxyResponse.status,
                            responseHeaders: proxyResponse.headers,
                            body: proxyResponse.body
                        });
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
                            status: proxyResponse.status,
                            responseHeaders: proxyResponse.headers,
                            body: proxyResponse.body
                        });
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