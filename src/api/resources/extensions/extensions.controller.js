import Extension from './externsions.model';

const appconf = require('../../../config/app');
const url = require('url');
const path = require('path');

const BIGIP_ADMIN_ROLE = appconf.f5_device_admin_role;
const CREATE_STATE = appconf.extension_create_status;
const DELETE_STATE = appconf.extension_delete_status;
const valid_protocols = ['file', 'http', 'https'];

export default {
    async create(req, res) {
        try {
            if (req.user.roles.includes(BIGIP_ADMIN_ROLE)) {
                if (req.body.hasOwnProperty('url')) {
                    const parsed_url = url.parse(req.body.url);
                    if (valid_protocols.includes(parsed_url.protocol)) {
                        const extension = await new Extension({
                            url: req.body.url,
                            status: CREATE_STATE
                        })
                        extension.save(function (err) {
                            if (err) {
                                err = "extension " + req.body.url + " err: " + err;
                                console.error(err);
                                return res.status(400).json({
                                    err: 'error in requesting extension:' + ex
                                })
                            } else { 
                                return res.status(201).json(extension);
                            }
                        });
                    } else {
                        const err = 'extension url must use the following protocols:' + JSON.stringify(valid_protocols);
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
            console.error('error requesting extension: ' + ex);
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
            console.error("Error listing extensions: " + err);
            return res.status(500).jons({
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
            return res.status(500).json({
                err: err
            });
        }
    },
    async findByURL(url) {
        try {
            const extension = await Extension.findOne({url: url});
            if (!extension) {
                const err = 'could not find extension for url:' + url;
                console.error(err);
                return null;
            }
            return extension
        } catch (err) {
            console.error(err);
            throw Error(err);
        }
    },
    async findByFilename(filename) {
        try {
            const extension = await Extension.findOne({filename: filename});
            if (!extension) {
                const err = 'could not find extension for filename:' + filename;
                console.error(err);
                return null;
            }
            return extension
        } catch (err) {
            console.error(err);
            throw Error(err);
        }
    },
    async updateStatusByURL(url,newstatus) {
        try {
            const extension = await Extension.findOne({url: url});
                if (!extension) {
                    const err = 'could not find extension with url: ' + url;
                    console.error(err);
                    throw Error(err);
                }
                extension.status=newstatus;
                extension.save(function (err) {
                    if (err) {
                        const err = 'could not save extension with url: ' + url + ' to status ' + newstatus;
                        console.error(err);
                        throw Error(err);
                    } else {
                        return true;
                    }
                });
        } catch (err) {
            console.error(err);
            throw Error(err);
        }
    },
    async updateModelByURL(url, name, version, release) {
        try {
            const extension = await Extension.findOne({url: url});
                if (!extension) {
                    const err = 'could not find extension with url: ' + url;
                    console.error(err);
                    throw Error(err);
                }
                extension.name = name;
                extension.version = version;
                extension.release = release;
                extension.save(function (err) {
                    if (err) {
                        const err = 'could not save extension with url: ' + url + ' to status ' + newstatus;
                        console.error(err);
                        throw Error(err);
                    } else {
                        return true;
                    }
                });
        } catch (err) {
            console.error(err);
            throw Error(err);
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
                    return res.status(404).json({
                        err: 'could not find extension to delete'
                    })
                }
                extension.status=DELETE_STATE;
                extension.save(function (err) {
                    if (err) res.status(400).json(err);
                    else return res.status(200).json(extension);
                });
            } else {
                return res.status(403).json({
                    err: 'removing extensions requires ' + BIGIP_ADMIN_ROLE + ' role'
                })
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                "err": err
            });
        }
    }
};