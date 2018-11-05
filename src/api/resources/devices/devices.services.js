/*jslint es6 */
"use strict";

import devicesController from './devices.controller';
import deploymentsController from '../deployments/deployments.controller';

const f5Gateway = require('../../../config/f5apigateway');
const request = require('request');

const UNDISCOVERED = 'UNDISCOVERED';

const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const syncTrustedDevices = (targetHost, targetPort) => {
    return new Promise((resolve) => {
        const req_options = {
            url: f5Gateway.f5_api_gw_devices_uri,
            json: true
        };
        request.get(req_options, (err, resp, body) => {
            if (err) {
                console.error('Error getting ASG trusted devices: ' + err);
                resolve({});
            }
            const trustedDevices = body.items;
            const updatePromises = [];
            devicesController.getAll()
                .then((knownDevices) => {

                    const knownDevicesIndx = {};
                    if (!Array.isArray(knownDevices)) {
                        knownDevices = [];
                    }
                    knownDevices.map((knownDevice) => {
                        knownDevicesIndx[knownDevice.targetHost + ':' + knownDevice.targetPort] = knownDevice;
                    });
                    trustedDevices.map((trustedDevice) => {
                        if (trustedDevice.hasOwnProperty('mcpDeviceName') || trustedDevice.state == UNDISCOVERED) {
                            if (knownDevicesIndx.hasOwnProperty(trustedDevice.address + ':' + trustedDevice.httpsPort)) {
                                delete knownDevicesIndx[trustedDevice.address + ':' + trustedDevice.httpsPort];
                            }
                            updatePromises.push(
                                devicesController.updateStateByTargetHostAndTargetPort(
                                    trustedDevice.address, trustedDevice.httpsPort, trustedDevice.state
                                )
                            );
                        }
                    });
                    Promise.all(updatePromises)
                        .then(() => {
                            const deletePromises = [];
                            knownDevices.map((knownDevice) => {
                                if (knownDevicesIndx.hasOwnProperty(knownDevice.targetHost + ':' + knownDevice.targetPort)) {
                                    console.log('removing known device ' + knownDevice.targetHost + ':' + knownDevice.targetPort + ' which is not trusted by the gateway.');
                                    deletePromises.push(deploymentsController.removeDeviceById(knownDevice.id));
                                    deletePromises.push(devicesController.removeById(knownDevice.id));
                                }
                            });
                            Promise.all(deletePromises)
                                .then(async () => {
                                    await wait(100);
                                    if (targetHost) {
                                        resolve(await devicesController.getByTargetHostAndTargetPort(targetHost, targetPort));
                                    } else {
                                        resolve(await devicesController.getAll());
                                    }
                                });
                        });
                });
        });
    });
};

const addDeviceToASG = (targetHost, targetPort, targetUsername, targetPassphrase) => {
    return new Promise((resolve) => {
        const get_options = {
            url: f5Gateway.f5_api_gw_trusted_devices_url,
            json: true
        };
        request.get(get_options, (err, resp, body) => {
            if (err) {
                return resolve();
            }
            const existingDevices = body.devices;
            existingDevices.map((device) => {
                if (device.targetHost == targetHost && device.targetPort == targetPort) {
                    resolve(device);
                }
            });
            const newDevice = {
                targetHost: targetHost,
                targetPort: targetPort,
                targetUsername: targetUsername,
                targetPassphrase: targetPassphrase
            };
            existingDevices.push(newDevice);
            const create_options = {
                url: f5Gateway.f5_api_gw_trusted_devices_url,
                body: {
                    "devices": existingDevices
                },
                json: true
            };
            request.post(create_options, function (err, resp, body) {
                if (err) {
                    resolve();
                }
                body.devices.map((device) => {
                    if (device.targetHost == targetHost && device.targetPort == targetPort) {
                        resolve(device);
                    }
                });
            });
        });
    });
};

const removeDeviceFromASG = (targetHost, targetPort) => {
    return new Promise((resolve) => {
        const get_options = {
            url: f5Gateway.f5_api_gw_trusted_devices_url,
            json: true
        };
        request.get(get_options, (err, resp, body) => {
            if (err) {
                return resolve([]);
            }
            const existingDevices = body.devices;
            const newDevices = [];
            existingDevices.map((device) => {
                if (device.targetHost != targetHost && device.targetPort != targetPort) {
                    newDevices.push(device);
                }
            });
            const post_options = {
                url: f5Gateway.f5_api_gw_trusted_devices_url,
                body: {
                    "devices": newDevices
                },
                json: true
            };
            request.post(post_options, function (err, resp, body) {
                if (err) {
                    resolve([]);
                }
                devicesController.removeByTargetHostAndTargetPort(targetHost, targetPort);
                resolve(body.devices);
            });
        });
    });
}

const proxyGetThroughASG = (uri, targetHost, targetPort, headers) => {
    return new Promise((resolve) => {
        const proxyOptions = {
            url: f5Gateway.f5_api_gw_proxy_url,
            body: {
                "method": "Get",
                "uri": f5Gateway.f5_bigip_base_uri(targetHost, targetPort) + uri,
                "headers": headers
            },
            json: true
        };
        request.post(proxyOptions, (err, resp, body) => {
            resolve({
                status: resp.statusCode,
                headers: resp.headers,
                body: body
            });
        });
    });
}

const proxyPostThroughASG = (uri, targetHost, targetPort, headers, body) => {
    return new Promise((resolve) => {
        const proxyOptions = {
            url: f5Gateway.f5_api_gw_proxy_url,
            body: {
                "method": "Post",
                "uri": f5Gateway.f5_bigip_base_uri(targetHost, targetPort) + uri,
                "headers": headers,
                "body": body
            },
            json: true
        };
        console.log('submitting POST request to ' + f5Gateway.f5_api_gw_proxy_url + ' with body ' + JSON.stringify(body));
        request.post(proxyOptions, (err, resp, body) => {
            resolve({
                status: resp.statusCode,
                headers: resp.headers,
                body: body
            });
        });
    });
}

const proxyPutThroughASG = (uri, targetHost, targetPort, headers, body) => {
    return new Promise((resolve) => {
        const proxyOptions = {
            url: f5Gateway.f5_api_gw_proxy_url,
            body: {
                "method": "Put",
                "uri": f5Gateway.f5_bigip_base_uri(targetHost, targetPort) + uri,
                "headers": headers,
                "body": body
            },
            json: true
        };
        request.post(proxyOptions, (err, resp, body) => {
            resolve({
                status: resp.statusCode,
                headers: resp.headers,
                body: body
            });
        });
    });
}

const proxyPatchThroughASG = (uri, targetHost, targetPort, headers, body) => {
    return new Promise((resolve) => {
        const proxyOptions = {
            url: f5Gateway.f5_api_gw_proxy_url,
            body: {
                "method": "Patch",
                "uri": f5Gateway.f5_bigip_base_uri(targetHost, targetPort) + uri,
                "headers": headers,
                "body": body
            },
            json: true
        };
        request.post(proxyOptions, (err, resp, body) => {
            resolve({
                status: resp.statusCode,
                headers: resp.headers,
                body: body
            });
        });
    });
}

const proxyDeleteThroughASG = (uri, targetHost, targetPort, headers) => {
    return new Promise((resolve) => {
        const proxyOptions = {
            url: f5Gateway.f5_api_gw_proxy_url,
            body: {
                "method": "Delete",
                "uri": f5Gateway.f5_bigip_base_uri(targetHost, targetPort) + uri,
                "headers": headers
            },
            json: true
        };
        request.post(proxyOptions, (err, resp, body) => {
            resolve({
                status: resp.statusCode,
                headers: resp.headers,
                body: body
            });
        });
    });
}

export default {
    async awaitGateway() {

        const pollForDeviceInfo = () => {
            return new Promise((resolve) => {
                try {
                    const deviceInfoOptions = {
                        url: f5Gateway.f5_api_gw_device_uri,
                        json: true
                    }
                    request.get(deviceInfoOptions, (err, resp, body) => {
                        if (err) {
                            resolve(false);
                        }
                        if (resp.statusCode > 399) {
                            resolve(false);
                        }
                        if (resp.statusCode == 200) {
                            resolve(true);
                        }
                    });
                } catch (err) {
                    resolve(false);
                }
            });
        }

        let retries = 100;
        while ((!await pollForDeviceInfo()) && retries > 0) {
            retries -= 1;
            await wait(2000);
        }
        if (retries > 0) {
            return true;
        } else {
            return false;
        }
    },
    async createTrustedDevice(targetHost, targetPort, targetUsername, targetPassphrase) {
        const existingDevice = await devicesController.getByTargetHostAndTargetPort(targetHost, targetPort);
        if (!existingDevice) {
            await addDeviceToASG(targetHost, targetPort, targetUsername, targetPassphrase);
            return syncTrustedDevices(targetHost, targetPort);
        } else {
            return existingDevice;
        }
    },
    async updateTrustedDevices() {
        return await syncTrustedDevices();
    },
    async getTrustedDevice(targetHost, targetPort) {
        return await syncTrustedDevices(targetHost, targetPort);
    },
    async removeTrustedDevice(targetHost, targetPort) {
        await removeDeviceFromASG(targetHost, targetPort);
    },
    async proxyGet(uri, targetHost, targetPort, headers) {
        return await proxyGetThroughASG(uri, targetHost, targetPort, headers);
    },
    async proxyPost(uri, targetHost, targetPort, headers, body) {
        return await proxyPostThroughASG(uri, targetHost, targetPort, headers, body);
    },
    async proxyPut(uri, targetHost, targetPort, headers, body) {
        return await proxyPutThroughASG(uri, targetHost, targetPort, headers, body);
    },
    async proxyPatch(uri, targetHost, targetPort, headers, body) {
        return await proxyPatchThroughASG(uri, targetHost, targetPort, headers, body);
    },
    async proxyDelete(uri, targetHost, targetPort, headers) {
        return await proxyDeleteThroughASG(uri, targetHost, targetPort, headers);
    }
}