import Extension from './extensions.model';
import extensionsServices from './extensions.services';
import devicesController from '../devices/devices.controller';
import {
    promises
} from 'fs';
import {
    format
} from 'util';

const appconf = require('../../../config/app');
const url = require('url');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;
const CREATE_STATE = appconf.extension_create_status;
const AVAILABLE = 'AVAILABLE';
const VALID_PROTOCOLS = appconf.extension_valid_protocols;

export default {
    async create(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                if (req.body.hasOwnProperty('url')) {
                    const rpmUrl = req.body.url;
                    let deviceIds = [];
                    if (req.body.hasOwnProperty('deviceIds')) {
                        if (Array.isArray(req.body.deviceIds)) {
                            deviceIds = req.body.deviceIds;
                        } else {
                            deviceIds = [reques.body.deviceIds];
                        }
                    }
                    let ongateway = false;
                    if (body.hasOwnProperty('onGateway') && ongateway) {
                        ongateway = true;
                    }
                    const parsed_url = url.parse(rpmUrl);
                    if (VALID_PROTOCOLS.includes(parsed_url.protocol)) {
                        const deviceQueryPromises = [];
                        const deviceTargets = [];
                        try {
                            deviceIds.map((deviceId) => {
                                const devicePromise = devicesController.getById(deviceId)
                                    .then((device) => {
                                        if (!device) {
                                            throw new Error('invalide deviceIds');
                                        } else if (device.state != 'ACTIVE') {
                                            throw new Error('all devices must be in the ACTIVE state');
                                        } else {
                                            deviceTargets.push({
                                                targetHost: device.targetHost,
                                                targetPort: targetPort
                                            })
                                        }
                                    })
                                    .catch((err) => {
                                        throw err;
                                    });
                                deviceQueryPromises.push(devicePromise)
                            })
                            await Promise.all(deviceQueryPromises)
                        } catch (err) {
                            return res.status(400).json({
                                err: err.message
                            });
                        }
                        let extension = await Extension.findOne({
                            url: rpmUrl
                        });
                        if (!extension) {
                            const extension = await new Extension({
                                url: rpmUrl,
                                status: CREATE_STATE
                            })
                            extension.save(async (err) => {
                                if (err) {
                                    console.error("error saving extension " + rpmUrl + " err: " + err);
                                    return res.status(400).json({
                                        err: 'error in requesting extension:' + err
                                    })
                                } else {
                                    const rpmFile = await extensionsServices.downloadExtensionToStorage(rpmUrl);
                                    if (ongateway) {
                                        extensionsServices.installExtensionOnGateway(rpmFile);
                                    }
                                    deviceTargets.map((target) => {
                                        extensionsServices.installExtensionOnTrustedDevice(rpmFile, target.targetHost, target.targetPort);
                                    });
                                    return res.status(201).json(extension);
                                }
                            });
                        } else {
                            const rpmFile = await extensionsServices.downloadExtensionToStorage(rpmUrl);
                            if (ongateway) {
                                extensionsServices.installExtensionOnGateway(rpmFile);
                            }
                            deviceTargets.map((target) => {
                                extensionsServices.installExtensionOnTrustedDevice(rpmFile, target.targetHost, target.targetPort);
                            });
                            return res.status(202).json(extension);
                        }
                    } else {
                        const err = 'extension url must use the following protocols:' + JSON.stringify(VALID_PROTOCOLS);
                        return res.status(400).json({
                            err: err
                        });
                    }
                } else {
                    return res.status(400).json({
                        err: 'invalid extension request url:' + req.body
                    })
                }
            } else {
                return res.status(403).json({
                    err: 'requests to download extensions required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (ex) {
            console.error('error creating extension: ' + ex.message);
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
                const extensions = await Extension.paginate({}, options);
                return res.json(extensions);
            } else {
                return res.status(403).json({
                    err: 'listing extensions requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error("Error listing extensions: " + err.message);
            return res.status(500).jons({
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
                const extension = await Extension.findById(id);
                if (!extension) {
                    const message = 'could not find extension to delete for id ' + id;
                    console.error(message);
                    return res.status(404).json({
                        err: message
                    })
                }
                const removePromises = []
                if (extension.onGateway) {
                    const uninstallOnGateway = extensionsServices.uninstallExtensionOnGateway(extension.filename);
                    removePromises.push(uninstallOnGateway);
                }
                extension.deviceIds.map(async (deviceId) => {
                    const device = await devicesController.getById(deviceId);
                    const uninstallOnTrustedDevice = extensionsServices.uninstallExtensionOnTrustedDevice(extension.filename, device.targetHost, device.targetPort);
                    removePromises.push(uninstallOnTrustedDevice);
                });
                const removeFromStorage = extensionsServices.removeExtensionFromStorage(extension.filename);
                removePromises.push(removeFromStorage);
                Promise.all(removePromises)
                    .then(async () => {
                        await Extension.findByIdAndRemove(id);
                        return res.status(202).json(extension);
                    });
            } else {
                return res.status(403).json({
                    err: 'removing extensions requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error(err.message);
            return res.status(500).json({
                "err": err
            });
        }
    },
    async findById(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const {
                    id
                } = req.params;
                const extension = await Extension.findById(id);
                if (!extension) {
                    return res.status(404).json({
                        err: 'could not find extension for ID:' + id
                    });
                }
                return res.json(extension);
            } else {
                return res.status(403).json({
                    err: 'listing extensions requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error("Error finding extensions by Id: " + err.message);
            return res.status(500).json({
                err: err.message
            });
        }
    },
    async getAll() {
        try {
            return await Extension.find();
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    },
    async findByURL(url) {
        try {
            const extension = await Extension.findOne({
                url: url
            });
            if (!extension) {
                const err = 'could not find extension for url:' + url;
                console.error(err);
                return null;
            }
            return extension
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    },
    async findByFilename(filename) {
        try {
            const extension = await Extension.findOne({
                filename: filename
            });
            if (!extension) {
                const err = 'could not find extension for filename:' + filename;
                console.error(err);
                return null;
            }
            return extension
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async createExtension(url, filename) {
        try {
            let extension = await Extension.findOne({
                url: url
            });
            if (!extension) {
                extension = await new Extension({
                    url: url,
                    status: CREATE_STATE
                })
                if (filename) {
                    extension.filename = filename;
                    extension.status = AVAILABLE;
                }
                extension.save(function (err) {
                    if (err) {
                        console.error(err.message);
                        throw err;
                    } else {
                        return extension;
                    }
                });
            } else {
                if (filename) {
                    extension.filename = filename;
                    extension.status = AVAILABLE;
                    extension.save(function (err) {
                        if (err) {
                            const err = 'could not save extension with url: ' + url + ' with filename ' + filename;
                            throw Error(err);
                        } else {
                            return true;
                        }
                    });
                } else {
                    return true;
                }
            }
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async updateStatusByURL(url, newstatus) {
        try {
            let extension = await Extension.findOne({
                url: url
            });
            if (!extension) {
                extension = await new Extension({
                    url: url,
                    status: newstatus
                })
                extension.save(function (err) {
                    if (err) {
                        console.error(err.message);
                        throw err;
                    } else {
                        return extension;
                    }
                });
            } else {
                extension.status = newstatus;
                extension.save(function (err) {
                    if (err) {
                        const err = 'could not save extension with url: ' + url + ' to status ' + newstatus + ' - ' + err;
                        throw Error(err);
                    } else {
                        return true;
                    }
                });
            }
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async updateStatusByFileName(filename, newstatus) {
        try {
            let extension = await Extension.findOne({
                filename: filename
            });
            if (extension) {
                extension.status = newstatus;
                extension.save(function (err) {
                    if (err) {
                        const err = 'could not save extension with filename: ' + filename + ' to status ' + newstatus;
                        throw Error(err);
                    } else {
                        return true;
                    }
                });
            }
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async updateExtensionByFileName(filename, packagename, name, version, release) {
        try {
            const extension = await Extension.findOne({
                filename: filename
            });
            if (!extension) {
                const err = 'could not find extension with filename: ' + filename;
                throw Error(err);
            }
            extension.packagename = packagename;
            extension.name = name;
            extension.version = version;
            extension.release = release;
            extension.save(function (err) {
                if (err) {
                    const err = 'could not save extension with filename: ' + filename;
                    throw Error(err);
                } else {
                    return true;
                }
            });
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async addExtensionByFileName(filename, targetHost, targetPort) {
        try {
            const extension = await Extension.findOne({
                filename: filename
            });
            if (!extension) {
                const err = 'could not find extension with filename: ' + filename;
                throw Error(err);
            }
            if (!targetHost) {
                extension.onGateway = true;
            } else {
                const device = await devicesController.getByTargetHostAndTargetPort(targetHost, targetPort);
                if (!extension.deviceIds) {
                    extension.deviceIds = [];
                }
                if (!extension.deviceIds.includes(device.id)) {
                    extension.deviceIds.push(device.id);
                }
            }
            extension.save(function (err) {
                if (err) {
                    const err = 'could not save extension with filename: ' + filename + ' - ' + err.message;
                    throw Error(err);
                } else {
                    return true;
                }
            });
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async removeExtensionByPackageName(packagename, targetHost, targetPort) {
        try {
            const extension = await Extension.findOne({
                packagename: packagename
            });
            if (!extension) {
                const err = 'could not find extension with packagename: ' + packagename;
                throw Error(err);
            }
            if (!targetHost) {
                extension.onGateway = false;
            } else {
                const device = await devicesController.getByTargetHostAndTargetPort(targetHost, targetPort);
                if (extension.deviceIds) {
                    extensions.deviceIds = extensions.deviceIds.filter(deviceid => deviceid !== device.id);
                }
            }
            extension.save(function (err) {
                if (err) {
                    const err = 'could not save extension with packagename: ' + packagename + ' - ' + err.message;
                    throw Error(err);
                } else {
                    return true;
                }
            });
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    }
};