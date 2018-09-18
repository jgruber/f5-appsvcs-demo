import User from './deployments.model';
import Device from '../devices/devices.model';
import devicesController from '../devices/devices.controller';

const appconf = require('../../../config/app');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;

export default {
    async createDeployments(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
                if(! Array.isArray(req.body) ) {
                   req.body = [req.body];
                }
                let has_errors = false;
                let errors = [];
                let new_deployments = [];
                req.body.map((deployment, idx) => {
                    new_deployment = new Deployment( {
                        name: deployment.name,
                        deviceIds: deployment.deviceIds
                    })
                    new_deployment.save(function (err) {
                        if (err) { 
                            has_errors = true;
                            errors.push(err); 
                        }
                    })
                    if (! has_errors ) {
                        new_deployments.push(new_deployment);
                    }
                });
                if (has_errors) {
                    // roll back
                    new_deployments.map( async (deployment, idx) => {
                        const del_deployemnt = await Deployment.findByIdAndRemove({
                            _id: deployment._idx
                        });
                    });
                    return res.status(400).json(errors);
                } else {
                    return res.status(200).json(deployments);
                }
            } else {
                return res.status(403).json({
                    err: 'updates to deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (ex) {
            return res.status(500).json(ex);
        }
    },
    async findAll(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
                const {
                    page,
                    perPage
                } = req.query;
                const options = {
                    page: parseInt(page, 10) || 1,
                    limit: parseInt(perPage, 10) || 10
                };
                const deployments = await Deployment.paginate({}, options);
                return res.json(deployemnts);
            } else {
                return res.status(403).json({
                    err: 'listing deployments requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            return res.status(500).send(err);
        }
    },
    async findById(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
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
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
                if(! Array.isArray(req.body) ) {
                    req.body = [req.body];
                }
                let has_errors = false;
                let errors = [];
                let update_deployments = [];
                req.body.map( async (deployment, idx) => {
                    const update_deployment = await Deployment.findById(deployment.id)
                    if(!update_deployment) {
                        has_errors = true;
                        errors.push('could not find deploy to update for ID:' + id);
                    } else {
                        update_deployment.name = deployment.name;
                        update_deployment.deviceIds = deployment.deviceIds;
                        update_deployement.save(function (err) {
                            if (err) {
                                has_errors = true;
                                errors.push('error updating deployment with ID:' + id + " - " + err);
                            }
                        });
                    }
                });
                if (has_errors) {
                    res.status(400).json({errors: errors, updated_deployments: update_deployments})
                } else {
                    res.status(200).json(update_deployments);
                }
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
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
                if(! Array.isArray(req.body) ) {
                    req.body = [req.body];
                }
                let has_errors = false;
                let errors = [];
                let delete_deployments = [];
                req.body.map( async (deployment, idx) => {
                    const delete_deployment = await Deployment.findByIdAndRemove(deployment.id)
                    if(!delete_deployment) {
                        has_errors = true;
                        errors.push('could not find deploy to delete for ID:' + id);
                    } else {
                        deleted_deployments.push(deployment.id);
                    }
                });
                if (has_errors) {
                    res.status(400).json({errors: errors, deleted_deployments: delete_deployments})
                } else {
                    res.status(200).json(delete_deployments);
                }
            } else {
                return res.status(403).json({
                    err: 'removing deployments required ' + BIGIP_ADMIN_ROLE + ' role'
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
                const devicesIds = deployment.deviceIds;
                let responses = [];
                deviceIds.map((deviceId, idx) => {
                    try {
                        devicesController.validateRequest(deviceId, req).then( (request) => {
                            if(request.valid) {
                                Device.get(id, request.uri, req.body)
                                    .then((pres) => {
                                        responses.push({id: deviceId, status: pres.resp.statusCode, body: pres.body})
                                    })
                            } else {
                                responses.push({id:deviceId, status:400, body: request.reason })
                            }
                        })
                    } catch(ex) {
                        responses.push({id: deviceId, status: 500, body: {err: ex} });
                    }
                })
                return res.status(200).json(responses);
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
                const devicesIds = deployment.deviceIds;
                let responses = [];
                deviceIds.map((deviceId, idx) => {
                    try {
                        devicesController.validateRequest(deviceId, req).then( (request) => {
                            if(request.valid) {
                                Device.post(id, request.uri, req.body)
                                    .then((pres) => {
                                        responses.push({id: deviceId, status: pres.resp.statusCode, body: pres.body})
                                    })
                            } else {
                                responses.push({id:deviceId, status:400, body: request.reason })
                            }
                        })
                    } catch(ex) {
                        responses.push({id: deviceId, status: 500, body: {err: ex} });
                    }
                })
                return res.status(200).json(responses);
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
                const devicesIds = deployment.deviceIds;
                let responses = [];
                deviceIds.map((deviceId, idx) => {
                    try {
                        devicesController.validateRequest(deviceId, req).then( (request) => {
                            if(request.valid) {
                                Device.put(id, request.uri, req.body)
                                    .then((pres) => {
                                        responses.push({id: deviceId, status: pres.resp.statusCode, body: pres.body})
                                    })
                            } else {
                                responses.push({id:deviceId, status:400, body: request.reason })
                            }
                        })
                    } catch(ex) {
                        responses.push({id: deviceId, status: 500, body: {err: ex} });
                    }
                })
                return res.status(200).json(responses);
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
                const devicesIds = deployment.deviceIds;
                let responses = [];
                deviceIds.map((deviceId, idx) => {
                    try {
                        devicesController.validateRequest(deviceId, req).then( (request) => {
                            if(request.valid) {
                                Device.get(id, request.uri, req.body)
                                    .then((pres) => {
                                        responses.patch({id: deviceId, status: pres.resp.statusCode, body: pres.body})
                                    })
                            } else {
                                responses.push({id:deviceId, status:400, body: request.reason })
                            }
                        })
                    } catch(ex) {
                        responses.push({id: deviceId, status: 500, body: {err: ex} });
                    }
                })
                return res.status(200).json(responses);
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
                const devicesIds = deployment.deviceIds;
                let responses = [];
                deviceIds.map((deviceId, idx) => {
                    try {
                        devicesController.validateRequest(deviceId, req).then( (request) => {
                            if(request.valid) {
                                Device.del(id, request.uri, req.body)
                                    .then((pres) => {
                                        responses.push({id: deviceId, status: pres.resp.statusCode, body: pres.body})
                                    })
                            } else {
                                responses.push({id:deviceId, status:400, body: request.reason })
                            }
                        })
                    } catch(ex) {
                        responses.push({id: deviceId, status: 500, body: {err: ex} });
                    }
                })
                return res.status(200).json(responses);
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