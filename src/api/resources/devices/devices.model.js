import {
    formatWithOptions,
    isArray
} from 'util';
import {
    resolveCname
} from 'dns';

const f5Gateway = require('../../../config/f5apigateway');
const request = require('request');
const cache = require('memory-cache');
const active = 'ACTIVE';

class Device {

    constructor(bigipHost, bigipPort, bigipUsername, bigipPassword) {
        this.bigipHost = bigipHost;
        this.bigipPort = bigipPort;
        this.bigipUsername = bigipUsername;
        this.bigipPassword = bigipPassword;
    }

    createTrust() {
        return new Promise((resolve, reject) => {
            if (this.bigipUsername && this.bigipPassword) {
                this._validateDeviceGroup().then(() => {
                    this._validateDeviceTrust().then((deviceInfo) => {
                        cache.put(deviceInfo.uuid, deviceInfo);
                        resolve(Device._clean_device(deviceInfo));
                    })
                })
            } else {
                err = 'device username and password required to create trust';
                throw Error(err);
            }
        });
    }

    static getTrusts() {
        return new Promise((resolve, reject) => {
            const req_options = {
                url: f5Gateway.f5_api_gw_devices_uri,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                if (resp.statusCode == 404) {
                    resolve([]);
                }
                if (isArray(body.items)) {
                    let devices = [];
                    body.items.map((device, indx) => {
                        if (device.state === active &&
                            device.hasOwnProperty('mcpDeviceName')) {
                            cache.put(device.uuid, device);
                            devices.push(Device._clean_device(device));
                        }
                    })
                    resolve(devices);
                } else {
                    resolve([]);
                }
                resolve(body);
            })
        })
    }

    static getTrustById(id) {
        return new Promise((resolve, reject) => {
            const deviceInfo = cache.get(id)
            if (deviceInfo !== null) {
                if (deviceInfo.state === active) {
                    cache.put(deviceInfo.uuid, deviceInfo);
                    resolve(Device._clean_device(deviceInfo))
                } else {
                    cache.del(id);
                }
            }
            const req_options = {
                url: f5Gateway.f5_api_gw_devices_uri + '/' + id,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                if (resp.statusCode == 404) {
                    resolve(null);
                }
                if (body.state === active) {
                    cache.put(body.uuid, body);
                    resolve(Device._clean_device(body));
                } else {
                    resolve(null);
                }
            })
        })
    }

    static getTrustByHostAndPort(address, httpsPort) {
        return new Promise((resolve, reject) => {
            const req_options = {
                url: f5Gateway.f5_api_gw_devices_uri,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                body.map((device, idx) => {
                    if (device.address === address && device.httpsPort == httpsPort) {
                        cache.put(device.uuid, device);
                        resolve(device);
                        return
                    }
                })
                if (resp.statusCode == 404) {
                    resolve(null);
                    return
                }
                resolve(null);
            })
        })
    }

    static get(deviceId, uri, body, cb) {
        return new Promise((resolve, reject) => {
            const device = cache.get(deviceId);
            if (device) {
                const proxy_options = {
                    url: f5Gateway.f5_api_gw_proxy_url,
                    body: {
                        "method": "Get",
                        "uri": f5Gateway.f5_bigip_base_uri(device.address, device.httpsPort) + uri,
                        "body": body
                    },
                    json: true
                };
                request.post(proxy_options, (err, resp, body) => {
                    resolve({
                        err: err,
                        resp: resp,
                        body: body
                    });
                });
            } else {
                const err = 'invalid trust device ' + deviceId;
                const resp = {
                    status: 400,
                    err: err
                }
                resolve(err, resp, {
                    'err': err
                });
            }
        });
    }

    static post(deviceId, uri, body, cb) {
        return new Promise((resolve, reject) => {
            const device = cache.get(deviceId);
            if (device) {
                const proxy_options = {
                    url: f5Gateway.f5_api_gw_proxy_url,
                    body: {
                        "method": "Post",
                        "uri": f5Gateway.f5_bigip_base_uri(device.address, device.httpsPort) + uri,
                        "body": body
                    },
                    json: true
                };
                request.post(proxy_options, (err, resp, body) => {
                    resolve({
                        err: err,
                        resp: resp,
                        body: body
                    });
                });
            } else {
                const err = 'invalid trust device ' + deviceId;
                const resp = {
                    status: 400,
                    err: err
                }
                resolve(err, resp, {
                    'err': err
                });
            }
        });
    }

    static put(deviceId, uri, body, cb) {
        return new Promise((resolve, reject) => {
            const device = cache.get(deviceId);
            if (device) {
                const proxy_options = {
                    url: f5Gateway.f5_api_gw_proxy_url,
                    body: {
                        "method": "Put",
                        "uri": f5Gateway.f5_bigip_base_uri(device.address, device.httpsPort) + uri,
                        "body": body
                    },
                    json: true
                };
                request.post(proxy_options, (err, resp, body) => {
                    resolve({
                        err: err,
                        resp: resp,
                        body: body
                    });
                });
            } else {
                const err = 'invalid trust device ' + deviceId;
                const resp = {
                    status: 400,
                    err: err
                }
                resolve(err, resp, {
                    'err': err
                });
            }
        });
    }

    static patch(deviceId, uri, body, cb) {
        return new Promise((resolve, reject) => {
            const device = cache.get(deviceId);
            if (device) {
                const proxy_options = {
                    url: f5Gateway.f5_api_gw_proxy_url,
                    body: {
                        "method": "Patch",
                        "uri": f5Gateway.f5_bigip_base_uri(device.address, device.httpsPort) + uri,
                        "body": body
                    },
                    json: true
                };
                request.post(proxy_options, (err, resp, body) => {
                    resolve({
                        err: err,
                        resp: resp,
                        body: body
                    });
                });
            } else {
                const err = 'invalid trust device ' + deviceId;
                const resp = {
                    status: 400,
                    err: err
                }
                resolve(err, resp, {
                    'err': err
                });
            }
        });
    }

    static del(deviceId, uri, body, cb) {
        return new Promise((resolve, reject) => {
            const device = cache.get(deviceId);
            if (device) {
                const proxy_options = {
                    url: f5Gateway.f5_api_gw_proxy_url,
                    body: {
                        "method": "Delete",
                        "uri": f5Gateway.f5_bigip_base_uri(device.address, device.httpsPort) + uri,
                        "body": body
                    },
                    json: true
                };
                request.post(proxy_options, (err, resp, body) => {
                    resolve({
                        err: err,
                        resp: resp,
                        body: body
                    });
                });
            } else {
                const err = 'invalid trust device ' + deviceId;
                const resp = {
                    status: 400,
                    err: err
                }
                resolve(err, resp, {
                    'err': err
                });
            }
        });
    }

    removeTrust() {
        return new Promise((resolve, reject) => {
            if (this.bigipUsername && this.bigipPassword) {
                let promises = [
                    this._removeDeviceFromGroup(),
                    this._removeBIGIPCertificateOnGateway(),
                    this._removeGWCertificateOnDevice()
                ]
                Promise.all(promises).then(() => {
                    resolve();
                });
            } else {
                err = 'device username and password required to remove trust';
                throw Error(err);
            }
        });
    }

    _getDeviceInfo() {
        return new Promise((resolve, reject) => {
            const req_options = {
                url: f5Gateway.f5_api_gw_devices_uri,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw (err);
                }
                let device_found = false;
                let device_info = null
                if (resp.statusCode != 404) {
                    body.items.map((device, idx) => {
                        if (device.deviceUri === f5Gateway.f5_bigip_base_uri(this.bigipHost, this.bigipPort)) {
                            device_found = true;
                            device_info = device;
                        }
                    });
                }
                if (device_found) {
                    resolve(device_info);
                } else {
                    resolve({});
                }
            })
        });
    }

    _getGatewayMachineId() {
        return new Promise((resolve, reject) => {
            const req_options = {
                url: f5Gateway.f5_api_gw_device_uri,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                if (body.hasOwnProperty('machineId')) {
                    resolve(body.machineId);
                } else {
                    resolve(null);
                }
            })
        });
    }

    _getDeviceMachineId() {
        return new Promise((resolve, reject) => {
            const req_options = {
                url: f5Gateway.f5_bigip_device_uri(this.bigipHost, this.bigipPort),
                auth: {
                    username: this.bigipUsername,
                    password: this.bigipPassword
                },
                rejectUnauthorized: false,
                requestCert: true,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                if (body.hasOwnProperty('machineId')) {
                    resolve(body.machineId);
                } else {
                    resolve(null);
                }
            })
        });
    }

    _validateDeviceGroup() {
        return new Promise((resolve, reject) => {
            const get_options = {
                url: f5Gateway.f5_api_gw_device_group_uri,
                json: true
            }
            request.get(get_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                if (resp.statusCode == 404) {
                    const create_body = {
                        "groupName": f5Gateway.f5_api_gw_device_group,
                        "display": "API Gateway Trust Group",
                        "description": "API Gateway Trust Group"
                    }
                    const post_options = {
                        url: f5Gateway.f5_api_gw_base_uri + '/mgmt/shared/resolver/device-groups/',
                        body: create_body,
                        json: true
                    }
                    request.post(post_options, (err, resp, body) => {
                        if (err) {
                            throw Error(err);
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
            })
        });
    }

    _validateDeviceTrust(options) {
        return new Promise((resolve, reject) => {
            const get_options = {
                url: f5Gateway.f5_api_gw_devices_uri,
                json: true
            }
            request.get(get_options, (err, resp, body) => {
                if (err) {
                    throw Error(err);
                }
                let device_found = false;
                let device_info = null
                if (resp.statusCode != 404) {
                    body.items.map((device, idx) => {
                        if (device.deviceUri === f5Gateway.f5_bigip_base_uri(this.bigipHost, this.bigipPort)) {
                            device_found = true;
                            device_info = device;
                        }
                    });
                }
                if (device_found) {
                    resolve(device_info);
                    return
                } else {
                    if (this.bigipUsername, this.bigipPassword) {
                        const create_body = {
                            "userName": this.bigipUsername,
                            "password": this.bigipPassword,
                            "address": this.bigipHost,
                            "httpsPort": this.bigipPort
                        };
                        const post_options = {
                            url: f5Gateway.f5_api_gw_devices_uri,
                            body: create_body,
                            json: true
                        }
                        request.post(post_options, (err, resp, body) => {
                            if (err) {
                                throw Error(err);
                            }
                            resolve(body);
                            return
                        });
                    } else {
                        const err = 'Can not establish device trust with device username and password';
                        throw new Error(err);
                    }
                }
            })

        });
    };

    _removeGWCertificateOnDevice() {
        return new Promise((resolve, reject) => {
            this._getGatewayMachineId()
                .then((machineId) => {
                    const get_options = {
                        url: f5Gateway.f5_bigip_cert_uri(this.bigipHost, this.bigipPort),
                        auth: {
                            username: this.bigipUsername,
                            password: this.bigipPassword
                        },
                        rejectUnauthorized: false,
                        requestCert: true,
                        json: true
                    }
                    request.get(get_options, (err, resp, body) => {
                        if (err) {
                            throw Error(err);
                        }
                        let cert_not_found = true;
                        body.items.map((cert, idx) => {
                            if (cert.machineId === machineId) {
                                cert_not_found = false;
                                const del_options = {
                                    url: f5Gateway.f5_bigip_cert_uri(this.bigipHost, this.bigipPort) + "/" + cert.certificateId,
                                    auth: {
                                        username: this.bigipUsername,
                                        password: this.bigipPassword
                                    },
                                    rejectUnauthorized: false,
                                    requestCert: true,
                                    json: true
                                }
                                request.del(del_options, (err, resp, body) => {
                                    if (err) {
                                        throw Error(err);
                                    }
                                    resolve({});
                                });
                            }
                        });
                        if (cert_not_found) {
                            resolve({});
                        }
                    })
                });
        });
    }

    _removeBIGIPCertificateOnGateway() {
        return new Promise((resolve, reject) => {
            this._getDeviceMachineId()
                .then((machineId) => {
                    const get_options = {
                        url: f5Gateway.f5_api_gw_cert_uri,
                        json: true
                    }
                    request.get(get_options, (err, resp, body) => {
                        if (err) {
                            throw Error(err);
                        }
                        let cert_not_found = true;
                        body.items.map((cert, idx) => {
                            if (cert.machineId === machineId) {
                                cert_not_found = false;
                                const del_options = {
                                    url: f5Gateway.f5_api_gw_cert_uri + "/" + cert.certificateId
                                }
                                request.del(del_options, (err, resp, body) => {
                                    if (err) {
                                        throw Error(err);
                                    }
                                    resolve();
                                });
                            }
                        });
                        if (cert_not_found) {
                            resolve();
                        }
                    });
                });
        });
    }

    _removeDeviceFromGroup() {
        return new Promise((resolve, reject) => {
            const req_options = {
                url: f5Gateway.f5_api_gw_devices_uri,
                json: true
            }
            request.get(req_options, (err, resp, body) => {
                if (err) {
                    throw (err);
                }
                let device_found = false;
                let device_info = null
                if (resp.statusCode != 404) {
                    body.items.map((device, idx) => {
                        if (device.deviceUri === f5Gateway.f5_bigip_base_uri(this.bigipHost, this.bigipPort)) {
                            device_found = true;
                            device_info = device;
                        }
                    });
                }
                if (device_found) {
                    const delete_options = {
                        url: f5Gateway.f5_api_gw_devices_uri + "/" + device_info.uuid,
                        json: true
                    }
                    request.del(delete_options, (err, resp, body) => {
                        if (err) {
                            throw Error(err);
                        }
                        resolve({});
                    })
                } else {
                    resolve({});
                }
            })
        });
    }

    static _clean_device(device) {
        device.id = device.uuid;
        delete device.uuid;
        f5Gateway.f5_hidden_device_properties.map(
            (property, ind) => {
                delete device[property];
            });
        return device;
    }
}

export default Device;