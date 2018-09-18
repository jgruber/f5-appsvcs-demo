import Deployment from './deployments.model';
import Device from '../devices/devices.model';
import devicesController from '../devices/devices.controller';

const appconf = require('../../../config/app');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;

export default {
    async createDeployments(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                if (!Array.isArray(req.body)) {
                    req.body = [req.body];
                }
                let has_errors = false;
                let errors = [];
                let new_deployments = [];
                let promises = [];
                req.body.map((deployment, idx) => {
                    // valid ID is a trusted host id
                    if (Array.isArray(deployment.deviceIds)) {
                        const valid_device_promises = deployment.deviceIds.map(async (deviceId, indx) => {
                            let device = await Device.getTrustById(deviceId)
                            if (! device) {
                                has_errors = true;
                                errors.push("deployment " + deployment.name + " deviceId " + deviceId + " is not a trusted device");
                                return
                            }
                        })
                        promises.push(valid_device_promises);
                        promises.push(new Promise( (resolve, reject ) => {
                            Promise.all(valid_device_promises).then ( async () => {                                
                                console.log('device ID checking done.. has_errors: ' + has_errors);
                                if (!has_errors) {
                                    const new_deployment = await new Deployment({
                                        name: deployment.name,
                                        deviceIds: deployment.deviceIds
                                    })
                                    new_deployment.save(function (err) {
                                        if (err) {
                                            has_errors = true;
                                            errors.push("deployment " + deployment.name + " err: " + err);
                                        }
                                    })
                                    new_deployments.push(new_deployment);
                                }
                                resolve();
                            })
                        }))
                    } else {
                        has_errors = true;
                        errors.push("deployment " + deployment.name + " err: deviceIds must be a list of device IDs");
                    }
                });
                Promise.all(promises).then( () => {
                    console.log('has_errors is' + has_errors);
                    console.log('errors is:' + errors);
                    if (has_errors) {
                        // roll back
                        new_deployments.map(async (deployment, idx) => {
                            const del_deployemnt = await Deployment.findByIdAndRemove({
                                _id: deployment._idx
                            });
                        });
                        return res.status(400).json(errors);
                    } else {
                        return res.status(200).json(new_deployments);
                    }
                })
            } else {
                return res.status(403).json({
                    err: 'updates to deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (ex) {
            console.error('error creating deployment: ' + ex);
            return res.status(500).json(ex);
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
            return res.status(500).send(err);
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
            return res.status(500).send(err);
        }
    },
    async updateDeployments(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                if (!Array.isArray(req.body)) {
                    req.body = [req.body];
                }
                let has_errors = false;
                let errors = [];
                let update_deployments = [];
                const updateRequestPromises = req.body.map(async (deployment, idx) => {
                    if (! deployment.hasOwnProperty('id')) {
                        has_errors = true;
                        errors.push('can not update a deployment without defining its ID');
                    } else {
                        const update_deployment = await Deployment.findById(deployment.id)
                        if (!update_deployment) {
                            has_errors = true;
                            errors.push('could not find deploy to update for ID:' + id);
                        } else {
                            update_deployment.name = deployment.name;
                            update_deployment.deviceIds = deployment.deviceIds;
                            update_deployment.save(function (err) {
                                if (err) {
                                    has_errors = true;
                                    errors.push('error updating deployment with ID:' + id + " - " + err);
                                }
                            });
                            update_deployments.push(update_deployment);
                        }
                    }
                });
                Promise.all(updateRequestPromises).then( () => {
                    if (has_errors) {
                        res.status(400).json({
                            errors: errors,
                            updated_deployments: update_deployments
                        })
                    } else {
                        res.status(200).json(update_deployments);
                    }
                })
            } else {
                return res.status(403).json({
                    err: 'updates to deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    },
    async removeDeployments(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                if (!Array.isArray(req.body)) {
                    req.body = [req.body];
                }
                let has_errors = false;
                let errors = [];
                let remove_deployments = [];
                const removeRequestPromises = req.body.map(async (deployment, idx) => {
                    if (! deployment.hasOwnProperty('id')) {
                        has_errors = true;
                        errors.push('can not remove a deployment without defining its ID');
                    } else {
                        const delete_deployment = await Deployment.findByIdAndRemove(deployment.id)
                        if (!delete_deployment) {
                            has_errors = true;
                            errors.push('could not find deploy to delete for ID:' + id);
                        } else {
                            remove_deployments.push(deployment.id);
                        }
                    }
                });
                Promise.all(removeRequestPromises).then( () => {
                    if (has_errors) {
                        res.status(400).json({
                            errors: errors,
                            removed_deployments: remove_deployments
                        })
                    } else {
                        res.status(200).json(remove_deployments);
                    }
                })
            } else {
                return res.status(403).json({
                    err: 'removing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
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
                            let pres = await  Device.get(deviceId, request.uri, req.body);
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
                Promise.all(deviceRequestPromises).then( () => {
                    return res.status(200).json(responses);
                })
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
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
                            let pres = await  Device.post(deviceId, request.uri, req.body);
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
                Promise.all(deviceRequestPromises).then( () => {
                    return res.status(200).json(responses);
                })
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
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
                            let pres = await  Device.put(deviceId, request.uri, req.body);
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
                Promise.all(deviceRequestPromises).then( () => {
                    return res.status(200).json(responses);
                })
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
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
                            let pres = await  Device.patch(deviceId, request.uri, req.body);
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
                Promise.all(deviceRequestPromises).then( () => {
                    return res.status(200).json(responses);
                })
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
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
                            let pres = await  Device.del(deviceId, request.uri, req.body);
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
                Promise.all(deviceRequestPromises).then( () => {
                    return res.status(200).json(responses);
                })
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    }
};