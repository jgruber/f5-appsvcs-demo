/*jslint es6 */
"use strict";

import devicesServices from '../devices/devices.services';
import extensionsServers from '../extensions/extensions.services';
import extensionsServices from '../extensions/extensions.services';

const appconf = require('../../../config/app');
const f5Gateway = require('../../../config/f5apigateway');
const request = require('request');

const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

export default {
    declareTrustedDevices(devices) {
        return new Promise((resolve, reject) => {
            const postOptions = {
                url: f5Gateway.f5_api_gw_trusted_devices_url,
                body: {
                    "devices": devices
                },
                json: true
            };
            request.post(postOptions, (err, resp, body) => {
                if (err) {
                    reject(err);
                } else {
                    if (resp.statusCode < 400) {
                        devicesServices.updateTrustedDevices()
                            .then(() => {
                                resolve();
                            })
                    } else {
                        const error = 'declaring trusted device returned status code: ' + resp.statusCode;
                        reject(new Error(error));
                    }
                }
            });
        })
    },
    declareExtensionsOnTrustedDevice(targetHost, targetPort, extensionUrls) {
        return new Promise(async (resolve, reject) => {
            let fileNames = [];
            let toInstall = [];
            let toRemove = [];
            try {
                for (let i = 0; i < extensionUrls.length; i++) {
                    fileNames.push(await extensionsServers.downloadExtensionToStorage(extensionUrls[i]));
                }
                toInstall = fileNames.slice();
            } catch (err) {
                reject(new Error('error downloading extensions - ' + err.message));

            }
            try {
                const knownExtensions = await extensionsServices.getExtensionsOnTrustedDevice(targetHost, targetPort);
                toRemove = knownExtensions.slice();
                knownExtensions.map((extension) => {
                    fileNames.map((rpmFile) => {
                        if (rpmFile.startsWith(extension.packageName)) {
                            toInstall.filter(i => i != rpmFile);
                            toRemove.filter(e => e.packageName != e.packageName);
                        }
                    })
                });
            } catch (err) {
                reject(new Error('error getting existing extensions from tusted device - ' + err.message));
            }

            const updatePromises = [];
            try {
                for (let j = 0; j < toRemove.length; j++) {
                    const extension = toRemove[j];
                    updatePromises.push(extensionsServices.uninstallExtensionOnTrustedDevice(extension.packageName + '.rpm', targetHost, targetPort));
                }
            } catch (err) {
                reject(new Error('error remove extension from trusted device - ' + err.message));
            }
            try {
                for (let j = 0; j < toInstall.length; j++) {
                    const rpmFile = toInstall[j];
                    updatePromises.push(extensionsServices.installExtensionOnTrustedDevice(rpmFile, targetHost, targetPort));
                }
            } catch (err) {
                reject(new Error('error installing extension from trusted device - ' + err.message));
            }

            await Promise.all(updatePromises);
            resolve();

        });
    }
}