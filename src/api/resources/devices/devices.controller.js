import Device from './devices.model';
import devicesServices from '../devices/devices.services';
const appconf = require('../../../config/app');
const url = require('url');
const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;

const validateRequest = (id, req) => {
    return new Promise((resolve, reject) => {
        Device.findById(id)
            .then((device) => {
                if (device) {
                    try {
                        const r_url = new url.URL(req.url, 'http://localhost');
                        const device_uri = decodeURIComponent(r_url.pathname.substring(r_url.pathname.indexOf('proxy') + 5)) + r_url.search;
                        const request = {
                            valid: true,
                            targetHost: device.targetHost,
                            targetPort: device.targetPort,
                            uri: device_uri,
                            reason: 'valid request'
                        }
                        resolve(request);
                    } catch (ex) {
                        console.error(ex.message);
                        resolve({
                            valid: false,
                            targetHost: device.targetHost,
                            targetPort: device.targetPort,
                            uri: null,
                            reason: 'url ' + req.url + ' is invalid'
                        });
                    }
                } else {
                    resolve({
                        valid: false,
                        targetHost: null,
                        targetPort: null,
                        uri: null,
                        device: null,
                        reason: 'no device for id ' + id
                    });
                }
            });
    });
}

export default {
    async create(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const device = req.body;
                if (device.hasOwnProperty('targetHost') &&
                    device.hasOwnProperty('targetUsername') &&
                    device.hasOwnProperty('targetPassword')) {
                    if (!device.hasOwnProperty('targetPort')) {
                        device.targetPort = 443;
                    }
                    const trustedDevice = await devicesServices.createTrustedDevice(
                        device.targetHost,
                        device.targetPort,
                        device.targetUsername,
                        device.targetPassphase
                    );
                    const newDevice = await new Device({
                        targetHost: targetHost,
                        targetPort: targetPost,
                        isBigIP: true,
                        state: trustedDevice.state
                    });
                    newDevice.save(function (err) {
                        if (err) {
                            console.error('error in creating trusted device:' + err.message);
                            throw err;
                        }
                        return res.status(200).json(newDevice);
                    });
                } else {
                    return res.status(400).json({
                        err: 'invalid device ' + device
                    })
                }
            } else {
                return res.status(403).json({
                    err: 'updates to devices required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (ex) {
            console.error('error creating device: ' + ex);
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
                const devices = await Device.paginate({}, options);
                return res.json(devices);
            } else {
                return res.status(403).json({
                    err: 'listing devices requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error("Error listing devices: " + err);
            return res.status(500).json({
                err: err.message
            });
        }
    },
    async findById(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const {
                    id
                } = req.params;
                await devicesServices.updateTrustedDevices();
                const device = await Device.findById(id);
                if (!device) {
                    return res.status(404).json({
                        err: 'could not find device for ID:' + id
                    });
                }
                return res.json(device);
            } else {
                return res.status(403).json({
                    err: 'listing devices requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
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
                const device = await Device.findById(id);
                if (device) {
                    await devicesServices.removeTrustedDevice(device.targetHost, device.targetPort);
                }
                await Device.findByIdAndRemove({
                    _id: id
                });
                if (!device) {
                    return res.status(404).json({
                        err: 'could not find device to delete'
                    })
                }
                return res.json({});
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
            validateRequest(id, req).then(async (request) => {
                if (request.valid) {
                    const proxyResponse = await devicesServices.proxyGet(request.uri, request.targetHost, request.targetPort, req.headers);
                    res.status(proxyResponse.status).set(proxyResponse.headers).send(proxyResponse.body);
                } else {
                    return res.status(400).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({
                err: err
            });
        }
    },
    async post(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then(async (request) => {
                if (request.valid) {
                    const proxyResponse = await devicesServices.proxyPost(request.uri, request.targetHost, request.targetPort, req.headers, req.body);
                    res.status(proxyResponse.status).set(proxyResponse.headers).send(proxyResponse.body);
                } else {
                    return res.status(400).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({
                err: err
            });
        }
    },
    async put(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then(async (request) => {
                if (request.valid) {
                    const proxyResponse = await devicesServices.proxyPut(request.uri, request.targetHost, request.targetPort, req.headers, req.body);
                    res.status(proxyResponse.status).set(proxyResponse.headers).send(proxyResponse.body);
                } else {
                    return res.status(400).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({
                err: err
            });
        }
    },
    async patch(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then(async (request) => {
                if (request.valid) {
                    const proxyResponse = await devicesServices.proxyPatch(request.uri, request.targetHost, request.targetPort, req.headers, req.body);
                    res.status(proxyResponse.status).set(proxyResponse.headers).send(proxyResponse.body);
                } else {
                    return res.status(400).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({
                err: err
            });
        }
    },
    async del(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then(async (request) => {
                if (request.valid) {
                    const proxyResponse = await devicesServices.proxyDelete(request.uri, request.targetHost, request.targetPort, req.headers);
                    res.status(proxyResponse.status).set(proxyResponse.headers).send(proxyResponse.body);
                } else {
                    return res.status(400).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({
                err: err
            });
        }
    },
    async getById(deviceId) {
        try {
            return await Device.findById(deviceId);
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    },
    async getAll() {
        try {
            const all = await Device.find();
            if (all) {
                return all;
            } else {
                return [];
            }
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    },
    async getByTargetHostAndTargetPort(targetHost, targetPort) {
        try {
            const device = await Device.findOne({
                targetHost: targetHost,
                targetPort: targetPort
            });
            return device;
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    },
    async removeByTargetHostAndTargetPort(targetHost, targetPort) {
        try {
            await Device.deleteMany({
                targetHost: targetHost,
                targetPort: targetPort
            }, function (err) {
                if (err) {
                    console.error('could not find extension with filename: ' + filename + ' - ' + err.message);
                    throw err;
                } else {
                    return true;
                }
            });
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async removeById(id) {
        try {
            await Device.findByIdAndRemove(id);
        } catch (err) {
            console.error(err.message);
            throw Error(err);
        }
    },
    async updateStateByTargetHostAndTargetPort(targetHost, targetPort, state, isbigip = true) {
        try {
            let device = await Device.findOne({
                targetHost: targetHost,
                targetPort: targetPort
            });
            if (device) {
                device.state = state;
                device.isBigIP = isbigip;
                device.save(function (err) {
                    if (err) {
                        console.error('error in updating device state:' + err.message);
                        throw err;
                    }
                    return device;
                });
            } else {
                device = await new Device({
                    targetHost: targetHost,
                    targetPort: targetPort,
                    isBigIP: isbigip,
                    state: state
                })
                device.save(function (err) {
                    if (err) {
                        console.error(err.message);
                        throw err;
                    } else {
                        return device;
                    }
                });
            }
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    }
};