import Deployment from './deployments.model';
import Device from '../devices/devices.model';
import devicesController from '../devices/devices.controller';

const appconf = require('../../../config/app');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;

export default {
    async createDeployment(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const deployment = req.body;
                if (deployment.hasOwnProperty('name') &&
                    deployment.hasOwnProperty('deviceIds') &&
                    Array.isArray(deployment.deviceIds)) {
                    let has_errors = false;
                    let errors = [];
                    let promises = [];
                    let new_deployment = null;
                    const valid_device_promises = deployment.deviceIds.map(async (deviceId, indx) => {
                        let device = await Device.getTrustById(deviceId);
                        if (!device) {
                            has_errors = true;
                            const err = "deployment " + deployment.name + " deviceId " + deviceId + " is not a trusted device";
                            console.error(err)
                            errors.push(err);
                        }
                        return
                    })
                    promises.push(valid_device_promises);
                    promises.push(new Promise((resolve, reject) => {
                        Promise.all(valid_device_promises).then(async () => {
                            if (!has_errors) {
                                console.log('creating new deployemnt');
                                new_deployment = await new Deployment({
                                    name: deployment.name,
                                    deviceIds: deployment.deviceIds
                                })
                                new_deployment.save(function (err) {
                                    if (err) {
                                        has_errors = true;
                                        err = "deployment " + deployment.name + " err: " + err;
                                        console.error(err);
                                        errors.push(err);
                                    }
                                })
                            }
                            resolve();
                        })
                    }));
                    Promise.all(promises).then(() => {
                        if (has_errors) {
                            return res.status(400).json(errors);
                        } else {
                            return res.status(200).json(new_deployment);
                        }
                    })
                } else {
                    return res.status(400).json({
                        err: 'invalid deployment ' + deployment
                    })
                }
            } else {
                return res.status(403).json({
                    err: 'updates to deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (ex) {
            console.error('error creating deployment: ' + ex);
            return res.status(500).json({err: ex});
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
            return res.status(500).jons({err: err});
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
            return res.status(500).json({err: err});
        }
    },
    async updateDeployment(req, res) {
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
                // validate ids
                const new_deployment = req.body;
                let has_errors = false;
                let errors = [];
                let promises = [];
                if (new_deployment.hasOwnProperty('deviceIds') &&
                    Array.isArray(new_deployment.deviceIds)) {
                    promises.push(new_deployment.deviceIds.map(async (deviceId, idx) => {
                        let device = await Device.getTrustById(deviceId)
                        if (!device) {
                            has_errors = true;
                            errors.push("deployment " + deployment.name + " deviceId " + deviceId + " is not a trusted device");
                        }
                    }));
                }
                Promise.all(promises).then( () => {
                    if(has_errors) {
                        return res.status(400).json({err: errors});
                    } else {
                        if (new_deployment.hasOwnProperty('name')) {
                            deployment.name = new_deployment.name;
                        }
                        deployment.deviceIds = new_deployment.deviceIds;
                        deployment.save(function (err) {
                            if (err) {
                                res.status(400).json({err: err});
                            }
                            res.status(200).json(deployment);
                        });
                    }
                });
            } else {
                return res.status(403).json({
                    err: 'updates to deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({err: err});
        }
    },
    async delete(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
            const {
                id
            } = req.params;
            console.log('deleting id:' +  id);
            const user = await Deployment.findByIdAndRemove({
                _id: id
            });
            if (!user) {
                return res.status(404).json({
                    err: 'could not find deployment to delete'
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
            return res.status(500).json({"err":err});
        }
    },
    async get(req, res) {
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
                const deviceIds = deployment.deviceIds;
                let responses = [];
                const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                    try {
                        let request = await devicesController.validateRequest(deviceId, req);
                        if (request.valid) {
                            let pres = await Device.get(deviceId, request.uri, req.body);
                            responses.push({
                                id: deviceId,
                                status: pres.resp.statusCode,
                                body: pres.body
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
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({err:err});
        }
    },
    async post(req, res) {
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
                const deviceIds = deployment.deviceIds;
                let responses = [];
                const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                    try {
                        let request = await devicesController.validateRequest(deviceId, req);
                        if (request.valid) {
                            let pres = await Device.post(deviceId, request.uri, req.body);
                            responses.push({
                                id: deviceId,
                                status: pres.resp.statusCode,
                                body: pres.body
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
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({err:err});
        }
    },
    async put(req, res) {
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
                const deviceIds = deployment.deviceIds;
                let responses = [];
                const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                    try {
                        let request = await devicesController.validateRequest(deviceId, req);
                        if (request.valid) {
                            let pres = await Device.put(deviceId, request.uri, req.body);
                            responses.push({
                                id: deviceId,
                                status: pres.resp.statusCode,
                                body: pres.body
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
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({err:err});
        }
    },
    async patch(req, res) {
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
                const deviceIds = deployment.deviceIds;
                let responses = [];
                const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                    try {
                        let request = await devicesController.validateRequest(deviceId, req);
                        if (request.valid) {
                            let pres = await Device.patch(deviceId, request.uri, req.body);
                            responses.push({
                                id: deviceId,
                                status: pres.resp.statusCode,
                                body: pres.body
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
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({err});
        }
    },
    async del(req, res) {
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
                const deviceIds = deployment.deviceIds;
                let responses = [];
                const deviceRequestPromises = deviceIds.map(async (deviceId, idx) => {
                    try {
                        let request = await devicesController.validateRequest(deviceId, req);
                        if (request.valid) {
                            let pres = await Device.del(deviceId, request.uri, req.body);
                            responses.push({
                                id: deviceId,
                                status: pres.resp.statusCode,
                                body: pres.body
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
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({err: err});
        }
    }
};