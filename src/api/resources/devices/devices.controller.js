import Device from './devices.model';

const BIGIP_ADMIN_ROLE = 'F5 Administrator';
const url = require('url');

const validateRequest = (id, req) => {
    return new Promise((resolve, reject) => {
        Device.getTrustById(id)
            .then((deviceInfo) => {
                if (deviceInfo) {
                    try {
                        const r_url = new url.URL(req.url, 'http://localhost');
                        const device_uri = r_url.pathname.substring(id.length+1) + r_url.search;
                        const request = {
                            valid: true,
                            uri: device_uri,
                            reason: 'valid request'
                        }
                        resolve(request);
                    } catch (ex) {
                        resolve({
                            valid: false,
                            uri: null,
                            reason: 'url ' + req.url + ' is invalid'
                        });
                    }
                } else {
                    resolve({
                        valid: false,
                        uri: null,
                        device: null,
                        reason: 'no active device trust for id ' + id
                    });
                }
            });
    });
}

export default {
    async createTrust(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const device = req.body;
                if (device.hasOwnProperty('bigipHost') &&
                    device.hasOwnProperty('bigipUsername') &&
                    device.hasOwnProperty('bigipPassword')) {
                    if (!device.hasOwnProperty('bigipPort')) {
                        device.bigipPort = 443;
                    }
                    try {
                        const bigip = new Device(
                            device.bigipHost,
                            device.bigipPort,
                            device.bigipUsername,
                            device.bigipPassword
                        );
                        let deviceInfo = await bigip.createTrust();
                        return res.status(201).json(deviceInfo);
                    } catch (ex) {
                        console.log(ex);
                        return res.status(400).json(ex);
                    }
                } else {
                    return res.status(400).json({
                        "err": "invalid BIG-IP Host"
                    });
                }
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (ex) {
            return res.status(500).json(ex);
        }
    },
    async getTrusts(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const devices = await Device.getTrusts();
                return res.json(devices);
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (err) {
            return res.status(500).json({
                err: err
            });
        }
    },
    async removeTrust(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                const device = req.body;
                if (device.hasOwnProperty('bigipHost') &&
                    device.hasOwnProperty('bigipUsername') &&
                    device.hasOwnProperty('bigipPassword')) {
                    if (!device.hasOwnProperty('bigipPort')) {
                        device.bigipPort = 443;
                    }
                    try {
                        const bigip = new Device(
                            device.bigipHost,
                            device.bigipPort,
                            device.bigipUsername,
                            device.bigipPassword
                        );
                        bigip.removeTrust().then( () => {
                            return res.status(200).json({});
                        });
                    } catch (ex) {
                        console.log(ex);
                        return res.status(400).json(ex);
                    }
                } else {
                    return res.status(400).json({
                        "err": "invalid BIG-IP Host"
                    });
                }
            } else {
                return res.status(401)
                    .json({
                        "err": "authenticated user must have " + BIGIP_ADMIN_ROLE + " role"
                    });
            }
        } catch (ex) {
            return res.status(500).json(ex);
        }
    },
    async get(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then((request) => {
                if (request.valid) {
                    Device.get(id, request.uri, req.body)
                        .then( (pres) => {
                            return res.status(pres.resp.statusCode).json(pres.body);
                        });
                } else {
                    return res.status(404).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    },
    async post(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then((request) => {
                if (request.valid) {
                    Device.post(id, request.uri, req.body)
                        .then( (pres) => {
                            return res.status(pres.resp.statusCode).json(pres.body);
                        });
                } else {
                    return res.status(404).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    },
    async put(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then((request) => {
                if (request.valid) {
                    Device.put(id, request.uri, req.body)
                        .then( (pres) => {
                            return res.status(pres.resp.statusCode).json(pres.body);
                        });
                } else {
                    return res.status(404).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    },
    async patch(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then((request) => {
                if (request.valid) {
                    Device.patch(id, request.uri, req.body)
                        .then( (pres) => {
                            return res.status(pres.resp.statusCode).json(pres.body);
                        });
                } else {
                    return res.status(404).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    },
    async del(req, res) {
        try {
            const {
                id
            } = req.params;
            validateRequest(id, req).then((request) => {
                if (request.valid) {
                    Device.del(id, request.uri, req.body)
                        .then( (pres) => {
                            return res.status(pres.resp.statusCode).json(pres.body);
                        });
                } else {
                    return res.status(404).json({
                        err: request.reason
                    })
                }
            });
        } catch (err) {
            console.log(err);
            return res.status(500).send(err);
        }
    }
};