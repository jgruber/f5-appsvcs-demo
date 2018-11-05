import Deployment from './deployments.model';
import Device from '../devices/devices.model';
import Extension from '../extensions/extensions.model';
import deploymentsServices from './deployments.services';
import devicesController from '../devices/devices.controller';
import devicesServices from '../devices/devices.services';
import extensionsController from "../extensions/extensions.controller";
import extensionsServices from '../extensions/extensions.services';
const appconf = require('../../../config/app');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;
const CREATE_STATE = appconf.CREATE_STATE;

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

const populateDeploymentDevices = async (deployment) => {
    let returnDevices = [];
    if ('devices' in deployment && deployment.devices.length > 0) {
        const extensionUrls = [];
        if ('extensions' in deployment && deployment.extensions.length > 0) {
            for (let j = 0; j < deployment.extensions.length; j++) {
                const extension = deployment.extensions[j];
                if ('id' in extension) {
                    const knownExtension = await extensionsController.getById(extension.id);
                    if (knownExtension) {
                        extensionUrls.push(knownExtension.url);
                    }
                } else if ('url' in extension) {
                    const knownExtension = await extensionsController.getByUrl(extension.url);
                    if (knownExtension) {
                        extensionUrls.push(knownExtension.url);
                    } else {
                        extensionUrls.push(extension.url);
                    }
                }
            }
        }
        for (let i = 0; i < deployment.devices.length; i++) {
            const device = deployment.devices[i];
            if ('id' in device) {
                const knownDevice = await devicesController.getById(device.id);
                if (!knownDevice) {
                    const error = 'device id ' + device.id + ' is not a known device';
                    throw new Error(error);
                } else {
                    knownDevice.extensionUrls = extensionUrls;
                    returnDevices.push(knownDevice);
                }
            } else {
                if (!('targetHost' in device)) {
                    const error = 'device missing requried targetHost attribute';
                    throw new Error(error);
                }
                if (!('targetPort' in device)) {
                    device.targetPort = 443;
                }
                const knownDevice = await devicesController.getByTargetHostAndTargetPort(device.targetHost, device.targetPort);
                if (knownDevice) {
                    knownDevice.extensionUrls = extensionUrls;
                    returnDevices.push(knownDevice);
                } else {
                    if ((!('targetUsername' in device)) && (!('targetPassphrase' in device))) {
                        const error = 'new device in deployment, but it is missing required attributes targetUsername and targetPassphrase';
                        throw new Error(error);
                    } else {
                        const newDevice = new Device({
                            targetHost: device.targetHost,
                            targetPort: device.targetPost,
                            isBigIP: true,
                            state: CREATE_STATE
                        });
                        await newDevice.save();
                        device.id = newDevice.id;
                        device.extensionUrls = extensionUrls;
                        returnDevices.push(device);
                    }
                }
            }
        }
    }
    return returnDevices;
}

const populateDeploymentExtensions = async (deployment) => {
    let returnExensions = [];
    if ('extensions' in deployment && deployment.extensions.length > 0) {
        for (let i = 0; i < deployment.extensions.length; i++) {
            const extension = deployment.extensions[i];
            if ('id' in extension) {
                const knownExtension = await extensionsController.getById(device.id);
                if (!knownExtension) {
                    const error = 'extension id ' + extension.id + ' is not a known extension';
                    throw new Error(error);
                } else {
                    returnExensions.push(knownExtension);
                }
            } else {
                if (!'url' in extension) {
                    const error = 'extension missing requried url attribute';
                    throw new Error(error);
                }
                const knownExtension = await extensionsController.getByUrl(extension.url);
                if (knownExtension) {
                    returnExensions.push(knownExtension);
                } else {
                    const newExtension = await new Extension({
                        url: extension.url,
                        status: CREATE_STATE
                    });
                    returnExensions.push(await newExtension.save());
                }
            }
        }
    }
    return returnExensions;
}

export default {
    async declareDeployment(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const returnDeviceIds = [];
                const returnExtensionIds = [];
                const declaredDevices = {};

                let populatedDevices;
                let populatedExtensions;

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

                try {
                    // see if we already know about the declared device by id or targetHost and targetPort
                    // so add the aleady known host to the declaration (devices are immutable in the app)
                    // if not, add a new device to trust to the declaration

                    populatedDevices = await populateDeploymentDevices(deployment);
                    populatedDevices.map((device) => {
                        returnDeviceIds.push(device.id);
                        declaredDevices[device.id] = device;
                    })

                    // get all existing deviceIds for all deployments so we can declare all trusteded devices
                    const deployments = await Deployment.find();
                    for (let i = 0; i < deployments.length; i++) {
                        const deploymentDevicesIds = deployments[i].devicesIds;
                        for (let j = 0; j < deploymentDevicesIds.length; j++) {
                            const deviceId = deploymentDevicesIds[j];
                            if (!returnDeviceIds.includes(deviceId)) {
                                const knownDevice = await Device.getById(deviceId)
                                if (knownDevice) {
                                    knownDevice.extensionUrls = [];
                                    for (let j = 0; j < deployments[i].extensionIds.length; j++) {
                                        const extension = extensionsController.getById(deployments[i].extensionIds[j]);
                                        knownDevice.extensionUrls.push(extension.url);
                                    }
                                    declaredDevices[deviceId] = knownDevice;
                                }
                            }
                        }
                    }
                    // populate all extensions in the declaration
                    populatedExtensions = await populateDeploymentExtensions(deployment);
                    populatedExtensions.map((extension) => {
                        returnExtensionIds.push(extension.id);
                    })
                } catch (err) {
                    const error = 'error in validating deployment devices and extensions - ' + err.message;
                    console.error(error);
                    return res.status(400).json({
                        err: error
                    });
                }

                // get extensions figure out for devices in the declaration
                try {
                    await deploymentsServices.declareTrustedDevices(Object.values(declaredDevices));
                } catch (err) {
                    const error = 'error in declaring trusted devices: ' + err.message;
                    console.error(error);
                    return res.status(400).json({
                        err: error
                    })
                }

                const extensionUpdates = [];
                try {
                    populatedDevices.map((device) => {
                        extensionUpdates.push(
                            deploymentsServices.declareExtensionsOnTrustedDevice(device.targetHost, device.targetPort, device.extensionUrls)
                            .then(() => {
                                extensionsServices.inventoryExtensionsOnTrustedDevice(device.targetHost, device.targetPort);
                            })
                        );
                    });
                } catch (err) {
                    throw err;
                }

                try {
                    await Promise.all(extensionUpdates)
                    const newDeployment = {
                        "name": deployment.name,
                        "deviceIds": returnDeviceIds,
                        "extensionIds": returnExtensionIds
                    }
                    const returnDeployment = await Deployment.create(newDeployment);
                    return res.status(201).json(await extendedOutput(returnDeployment));
                } catch (err) {
                    return res.status(500).json({
                        err: 'error in creating deployment - ' + err.message
                    })
                }
            } else {
                return res.status(403).json({
                    err: 'creating deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                });
            }
        } catch (ex) {
            console.error('error creating deployment: ' + ex.message);
            return res.status(500).json({
                err: ex.message
            });
        }
    },
    async updateDeployment(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const returnDeviceIds = [];
                const returnExtensionIds = [];
                const declaredDevices = {};

                let populatedDevices;
                let populatedExtensions;

                const deployment = req.body;

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

                try {
                    // see if we already know about the declared device by id or targetHost and targetPort
                    // so add the aleady known host to the declaration (devices are immutable in the app)
                    // if not, add a new device to trust to the declaration

                    populatedDevices = await populateDeploymentDevices(deployment);
                    populatedDevices.map((device) => {
                        returnDeviceIds.push(device.id);
                        declaredDevices[device.id] = device;
                    })

                    // get all existing deviceIds for all deployments so we can declare all trusteded devices
                    const deployments = await Deployment.find();
                    for (let i = 0; i < deployments.length; i++) {
                        if (deployments[i].id !== id) {
                            const deploymentDeviceIds = deployments[i].deviceIds;
                            for (let j = 0; j < deploymentDeviceIds.length; j++) {
                                const deviceId = deploymentDeviceIds[j];
                                if (!returnDeviceIds.includes(deviceId)) {
                                    const knownDevice = await devicesController.getById(deviceId)
                                    if (knownDevice) {
                                        knownDevice.extensionUrls = [];
                                        for (let j = 0; j < deployments[i].extensionIds.length; j++) {
                                            const extension = extensionsController.getById(deployments[i].extensionIds[j]);
                                            knownDevice.extensionUrls.push(extension.url);
                                        }
                                        declaredDevices[deviceId] = knownDevice;
                                    }
                                }
                            }
                        }
                    }
                    // populate all extensions in the declaration
                    populatedExtensions = await populateDeploymentExtensions(deployment);
                    populatedExtensions.map((extension) => {
                        returnExtensionIds.push(extension.id);
                    })
                } catch (err) {
                    console.error(err);
                    const error = 'error in validating deployment devices and extensions - ' + err.message;
                    console.error(error);
                    return res.status(400).json({
                        err: error
                    });
                }

                // get extensions figure out for devices in the declaration
                try {
                    await deploymentsServices.declareTrustedDevices(Object.values(declaredDevices));
                } catch (err) {
                    const error = 'error in declaring trusted devices: ' + err.message;
                    console.error(error);
                    return res.status(400).json({
                        err: error
                    })
                }

                const extensionUpdates = [];
                try {
                    populatedDevices.map((device) => {
                        extensionUpdates.push(
                            deploymentsServices.declareExtensionsOnTrustedDevice(device.targetHost, device.targetPort, device.extensionUrls)
                            .then(() => {
                                extensionsServices.inventoryExtensionsOnTrustedDevice(device.targetHost, device.targetPort);
                            })
                        );
                    });
                } catch (err) {
                    throw err;
                }

                try {
                    await Promise.all(extensionUpdates)
                    existingDeployment.name = deployment.name;
                    existingDeployment.deviceIds = returnDeviceIds;
                    existingDeployment.extensionIds = returnExtensionIds;
                    await existingDeployment.save();
                    return res.status(201).json(await extendedOutput(existingDeployment));
                } catch (err) {
                    return res.status(500).json({
                        err: 'error in creating deployment - ' + err.message
                    })
                }

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
                const deviceIndexById = {};
                for (let i = 0; i < existingDeployment.deviceIds.length; i++) {
                    const device = await devicesController.getById(existingDeployment.deviceIds[i]);
                    deviceIndexById[device.id] = device;
                    for (let j = 0; j < existingDeployment.extensionIds.length; j++) {
                        const extension = await extensionsController.getById(existingDeployment.extensionIds[j]);
                        console.log('uninstalling extension ' + extension.filename + ' from ' + device.targetHost + ':' + device.targetPort);
                        const uninstalled = await extensionsServices.uninstallExtensionOnTrustedDevice(extension.filename, device.targetHost, device.targetPort);
                        if (uninstalled) {
                            console.log('extension uninstalled from ' + device.targetHost + ':' + device.targetPort);
                        }
                    }
                }

                for (let i = 0; i < existingDeployment.deviceIds.length; i++) {
                    const device = deviceIndexById[existingDeployment.deviceIds[i]];
                    if (device) {
                        await devicesServices.removeTrustedDevice(device.targetHost, device.targetPort);
                    }
                }
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
    },
    async removeDeviceById(deviceId) {
        try {
            const existingDeployments = Deployment.find();
            for (let i = 0; i < existingDeployments.length; i++) {
                if (existingDeployments.deviceIds.includes(deviceId)) {
                    const deployment = existingDeployments[i];
                    deployment.deviceIds.filter(d => d != deviceId);
                    await deployment.save((err) => {
                        if (err) {
                            console.error('error in saving Deployment:' + err.message);
                            throw err;
                        }
                    });
                }
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
};