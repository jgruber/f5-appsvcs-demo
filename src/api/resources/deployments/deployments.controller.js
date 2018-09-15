import User from './deployments.model';

const BIGIP_ADMIN_ROLE = 'F5 Administrator';
const BIGIP_TENANT_ROLE = 'F5 Tenant';

export default {
    async create(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {

                const deployment = new deployment({
                    name: req.body.name,
                    deviceIds: req.body.deviceIds
                });

                deployment.save(function (err) {
                    if (err) return res.status(400).json(err);
                    return res.status(200).json(deployment);
                })

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
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE) ||
                req.user.roles.includes(BIGIP_TENANT_ROLE)) {
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
                    err: 'listing deployments requires ' + BIGIP_TENANT_ROLE + ' role'
                })
            }
        } catch (err) {
            return res.status(500).send(err);
        }
    },
    async findById(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE) ||
                req.user.roles.includes(BIGIP_TENANT_ROLE)) {
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
                    err: 'listing deployments requires ' + BIGIP_TENANT_ROLE + ' role'
                })
            }
        } catch (err) {
            return res.status(500).send(err);
        }
    },
    async update(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
                const id = req.body.id;
                const deployment = await Deployment.findById(id);
                if (!deployment) {
                    return res.status(404).json({
                        err: 'could not find deployment to update for ID:' + id
                    });
                }
                deployment.name = req.body.name;
                deployment.deviceIds = req.body.deviceId;
                deployement.save(function (err) {
                    if (err) res.status(400).json(err);
                    else return res.status(200).json(deployment);
                });
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
    async delete(req, res) {
        try {
            if (req.user.roles.includes(BIG_IP_ADMIN_ROLE)) {
                const id = req.body.id;
                const deployemnt = await Deployment.findByIdAndRemove({
                    _id: id
                });
                if (!user) {
                    return res.status(404).json({
                        err: 'could not find deployment to remove'
                    })
                }
                return res.json({});
            } else {
                return res.status(403).json({
                    err: 'removal of deployments required ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            return res.status(500).send(err);
        }
    }
};