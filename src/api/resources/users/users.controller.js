import User from './users.model';

const appconf = require('../../../config/app');

const ADMINISTRATOR_ROLE = appconf.user_admin_role;

export default {
    async create(req, res) {
        try {
            // If no users have been created yet, create and make User Administrator
            User.count({}, function (err, count) {
                if (err) res.status(500).json({"err": err});
                var roles = [];
                if (count == 0) {
                    roles.push(ADMINISTRATOR_ROLE);
                } else {
                    // require authentication and ROLE if more than 0 users exist
                    if (!req.hasOwnProperty('user')){
                        return res.status(401).json('Unauthorized');
                    }
                    if (!req.user.roles.includes(ADMINISTRATOR_ROLE)) {
                        return res.status(403).json({
                            err: 'updates to users required User Administrator role'
                        })
                    }
                }
                const user = new User({
                    username: req.body.username,
                    password: req.body.password,
                    roles: roles
                })
                user.save(function (err) {
                    if (err) return res.status(400).json(err);
                    return res.status(201).json(user);
                })
            })
        } catch (ex) {
            return res.status(500).json({"err":ex});
        }
    },
    async findAll(req, res) {
        try {
            const {
                page,
                perPage
            } = req.query;
            const options = {
                page: parseInt(page, 10) || 1,
                limit: parseInt(perPage, 10) || 10
            };
            const users = await User.paginate({}, options);
            return res.json(users);
        } catch (err) {
            return res.status(500).json({"err":err});
        }
    },
    async findById(req, res) {
        try {
            const {
                id
            } = req.params;
            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({
                    err: 'could not find user for ID:' + id
                });
            }
            return res.json(user);
        } catch (err) {
            return res.status(500).json({"err":err});
        }
    },
    async update(req, res) {
        try {
            const {
                id
            } = req.params;
            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({
                    err: 'could not find user to update for ID:' + id
                });
            }
            // require and admin role to update users
            if (req.user.roles.includes(ADMINISTRATOR_ROLE)) {
                if(req.body.password) {
                    user.password = req.body.password;
                }
                if (user.roles.includes(ADMINISTRATOR_ROLE)) {
                    const new_roles = req.body.roles;
                    if (! new_roles.includes(ADMINISTRATOR_ROLE)) {
                        const admin_users = await User.find({ roles: [ADMINISTRATOR_ROLE] });
                        if (!admin_users) {
                            console.log('No User Administrator users found!');
                            return res.status(500).json({
                                err: 'No User Administrator users found!'
                            })
                        }
                        if (admin_users.length < 2) {
                            console.log('Can not remove the last User Administrator role!')
                            req.body.roles.push(ADMINISTRATOR_ROLE);
                        }
                    }
                }
                user.roles = req.body.roles;
                user.save(function (err) {
                    if (err) res.status(400).json(err);
                    else return res.status(200).json(user);
                });
            } else {
                return res.status(403).json({
                    err: 'updates to users required User Administrator role'
                })
            }
        } catch (err) {
            console.log(err);
            return res.status(500).json({"err":err});
        }
    },
    async delete(req, res) {
        try {
            const {
                id
            } = req.params;
            const user = await User.findByIdAndRemove({
                _id: id
            });
            if (!user) {
                return res.status(404).json({
                    err: 'could not find user to delete'
                })
            }
            return res.json({});
        } catch (err) {
            return res.status(500).json({"err":err});
        }
    }
};