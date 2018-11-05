/*jslint es6 */
"use strict";

import extensionsController from './extensions.controller';
import devicesController from '../devices/devices.controller';
import devicesServices from '../devices/devices.services';

const f5Gateway = require('../../../config/f5apigateway');
const appconf = require('../../../config/app');
const {
    exec
} = require('child_process');

const fs = require('fs');
const path = require('path');
const url = require('url');
const request = require('request');

const STORAGE_PATH = appconf.extension_storage_path;
const DOWNLOADING = appconf.extension_downloading_status;
const ERROR = appconf.extension_error_status;

const rpmQueryCmd = '/bin/rpm -qp --queryformat "\%{NAME}:%{VERSION}:%{RELEASE}" ';

const FINISHED = 'FINISHED';
const FAILED = 'FAILED';

const VALID_PROTOCOLS = appconf.extension_valid_protocols;

const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const createExtension = async (rpmUrl, filename) => {
    try {
        await extensionsController.createExtension(rpmUrl, filename);
        const attributes = getExtensionAttributes(filename);
        const packageName = filename.split('.').slice(0, -1).join('.');
        await wait(100);
        extensionsController.updateExtensionByFileName(filename, packageName, attributes.name, attributes.version, attributes.release);
    } catch (err) {
        console.error('can not create extension url: ' + rpmUrl + ' filename: ' + filename + ' - ' + err.message);
    }
}

const syncExtensionDevices = () => {
    return new Promise((resolve) => {
        getExtensions()
            .then((gatewayextensions) => {
                gatewayextensions.map((extension) => {
                    const rpmFile = extension.packageName + '.rpm';
                    addExtensionByFileName(rpmFile);
                })
            })
            .catch((err) => {
                console.error('error updating extension on gateway - ' + err.message);
            });
        devicesController.getAll()
            .then((existingDevices) => {
                existingDevices.map((device) => {
                    getExtensions(device.targetHost, device.targetPort)
                        .then((deviceExtensions) => {
                            deviceExtensions.map((extension) => {
                                const rpmFile = extension.packageName + '.rpm';
                                addExtensionByFileName(rpmFile, device.targetHost, device.targetPort);
                            })
                        })
                });
            })
            .catch((err) => {
                console.err('error querying trusted devices - ' + err.message);
            });
    });
}

const updateExtensionStatusByURL = async (url, status) => {
    try {
        return await extensionsController.updateStatusByURL(url, status);
    } catch (err) {
        console.error('can not update extension state: ' + err.message);
    }
};

const addExtensionByFileName = async (filename, targetHost, targetPort) => {
    try {
        return await extensionsController.addExtensionByFileName(filename, targetHost, targetPort);
    } catch (err) {
        console.error('can not add extension with targetHost:' + targetHost + ' targetPort:' + targetPort + ' filename:' + filename + ' - ' + err.message);
    }
}

const validateStorageDir = () => {
    try {
        if (!fs.existsSync(STORAGE_PATH)) {
            fs.mkdirSync(STORAGE_PATH, '0744');
            return true;
        }
        return true;
    } catch (err) {
        console.error('error validating storage path ' + err.message);
        return false;
    }
};

const copyRpmFileToStorageLocation = (rpmFilePath, symlink = false) => {
    if (validateStorageDir()) {
        const filename = path.basename(rpmFilePath);
        const dest = STORAGE_PATH + '/' + filename;
        if (fs.existsSync(rpmFilePath)) {
            try {
                if (!fs.existsSync(dest)) {
                    if (symlink) {
                        fs.symlinkSync(rpmFilePath, dest);
                    } else {
                        fs.createReadStream(rpmFilePath).pipe(fs.createWriteStream(dest));
                    }
                }
                return filename;
            } catch (err) {
                throw err;
            }
        } else {
            const err = 'file does not exist ' + rpmFilePath;
            console.error(err);
            throw Error(err);
        }
    } else {
        return false;
    }
};

const listStorage = () => {
    if (validateStorageDir()) {
        return fs.readdirSync(STORAGE_PATH).filter(fn => fn.includes('.rpm'));
    } else {
        return [];
    }
}

const rpmFileExits = (rpmFile) => {
    if (validateStorageDir()) {
        if (fs.existsSync(STORAGE_PATH + '/' + rpmFile)) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

const removeRpmFile = (rpmFile) => {
    try {
        if (rpmFileExits(rpmFile)) {
            fs.unlinkSync(STORAGE_PATH + '/' + rpmFile);
        }
        return true;
    } catch (ex) {
        const err = 'error deleting extension file ' + rpmFile + ' - ' + ex;
        console.error(err);
        return false;
    }
};

const downloadFile = (url) => {
    return new Promise((resolve) => {
        const filename = path.basename(url);
        if (rpmFileExits(filename)) {
            resolve(filename);
        }
        const getOptions = {
            url: url,
            encoding: null,
            resolveWithFullResponse: true,
            headers: {
                'accept-encoding': 'identity'
            }
        };
        request.get(getOptions)
            .on('response', function (res) {
                if (res.statusCode === 200) {
                    try {
                        let contentDisposition = res.headers['content-disposition'];
                        let match = contentDisposition && contentDisposition.match(/(filename=|filename\*='')(.*)$/);
                        let filename = match && match[2] || path.basename(url);
                        if (rpmFileExits(filename)) {
                            removeRpmFile(filename);
                        }
                        let dest = fs.createWriteStream(STORAGE_PATH + "/" + filename);
                        dest.on('error', function (err) {
                            console.error(err);
                            resolve(null);
                        });
                        dest.on('finish', function () {
                            resolve(filename);
                        })
                        res.pipe(dest);
                    } catch (err) {
                        console.error('error downloading and saving ' + url + ' - ' + err.message);
                        resolve(null);
                    }
                } else {
                    console.error('download attempt for ' + url + ' returned status ' + res.statusCode);
                    resolve(null);
                }
            });
    });
};

const removeFileFromStorage = async (rpmFile) => {
    if (rpmFile && rpmFileExits(rpmFile)) {
        removeRpmFile(rpmFile);
    }
}

const storageDownload = async (rpmUrl) => {
    try {
        let filename = path.basename(rpmUrl);
        if (rpmFileExits(filename)) {
            await createExtension(rpmUrl, filename);
            return filename;
        }
        const download_url = url.parse(rpmUrl);
        if (VALID_PROTOCOLS.includes(download_url.protocol)) {
            if (download_url.protocol == 'file:') {
                try {
                    const filename = copyRpmFileToStorageLocation(download_url.pathname, true);
                    await createExtension(rpmUrl, filename);
                    return filename;
                } catch (err) {
                    console.error('copy RPM file returned error:' + err.message);
                    await createExtension(rpmUrl);
                    await updateExtensionStatusByURL(url, ERROR);
                    return null;
                }
            } else {
                updateExtensionStatusByURL(rpmUrl, DOWNLOADING);
                const filename = await downloadFile(rpmUrl);
                if (filename) {
                    await createExtension(rpmUrl, filename);
                } else {
                    await createExtension(rpmUrl);
                    await updateExtensionStatusByURL(rpmUrl, ERROR);
                }
                return filename;
            }
        } else {
            const err = 'extension url must use the following protocols:' + JSON.stringify(VALID_PROTOCOLS);
            console.error(err);
            return null;
        }
    } catch (ex) {
        const err = 'error downloading extension to storage ' + rpmUrl + ' - ' + ex.message;
        console.error(err);
        return null;
    }
};

const multipartUpload = async (rpmFile, uploadUrl) => {
    const parsedUrl = url.parse(uploadUrl);
    const filePath = STORAGE_PATH + '/' + rpmFile;
    const fstats = fs.statSync(filePath);
    const fileEnd = fstats.size - 1;
    const CHUNK_SIZE = 512000;
    let start = 0;
    let end = fileEnd;
    if (CHUNK_SIZE < fileEnd - 1)
        end = CHUNK_SIZE - 1;

    const uploadPart = (filePath, start, end, total, uploadUrl) => {
        return new Promise((resolve) => {
            const headers = {
                'Content-Type': 'application/octet-stream',
                'Content-Range': (start + '-' + end + '/' + total),
                'Content-Length': ((end - start) + 1),
                'Connection': 'keep-alive'
            }
            const upload_opts = {
                url: uploadUrl,
                headers: headers
            }
            fs.createReadStream(filePath, {
                start: start,
                end: end
            }).pipe(
                request.post(upload_opts, (err, res, body) => {
                    if (err) {
                        console.error('error uploading file: ' + err);
                        resolve(false);
                    }
                    if (res.statusCode >= 400) {
                        console.error('error uploading file with status Code ' + res.statusCode + ' - ' + body);
                        resolve(false);
                    }
                    resolve(true);
                }));
        });
    }
    try {
        console.log('uploading ' + rpmFile + ' (' + fstats.size + ' bytes) to ' + parsedUrl.hostname + ':' + parsedUrl.port);
        while (end <= fileEnd) {
            const chunkUploaded = await uploadPart(filePath, start, end, fstats.size, uploadUrl);
            if (chunkUploaded) {
                start = start + CHUNK_SIZE;
                if (start > fileEnd) {
                    break;
                } else {
                    if (end + CHUNK_SIZE > fileEnd) {
                        end = fileEnd;
                    } else {
                        end = end + CHUNK_SIZE;
                    }
                }
            }
        }
        return true;
    } catch (err) {
        console.error('failed upload : ' + err.message);
        return false;
    }
};

const gatewayUpload = async (rpmFile) => {
    try {
        if (await multipartUpload(rpmFile, f5Gateway.f5_api_gw_upload_uri + '/' + rpmFile)) {
            return true;
        } else {
            console.error('uploading to Gateway failed.');
            return false;
        }
    } catch (err) {
        console.error(err.message);
        return false;
    }
};

const getTrustedDeviceToken = (targetHost) => {
    return new Promise((resolve) => {
        const get_options = {
            url: f5Gateway.f5_api_gw_proxy_url + '/' + targetHost,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        request.get(get_options, async (err, resp, body) => {
            if (err) {
                console.error('Can not get truste token for ' + targetHost + ':' + err.message);
                resolve();
            }
            body = JSON.parse(body);
            if (body.hasOwnProperty('queryParam')) {
                resolve(body.queryParam);
            } else {
                resolve();
            }
        });
    });
}

const trustedDeviceUpload = async (rpmFile, targetHost, targetPort) => {
    try {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
        const token = await getTrustedDeviceToken(targetHost);
        if (token) {
            const uploadUrl = f5Gateway.f5_bigip_upload_uri(targetHost, targetPort) + '/' + rpmFile + '?' + token;
            if (await multipartUpload(rpmFile, uploadUrl)) {
                return true;
            } else {
                console.error('uploading to trusted host ' + targetHost + ':' + targetPort + ' failed.');
                return false;
            }
        } else {
            console.error('error in fetching trusted host ' + targetHost + ':' + targetPort + ' token.');
            return false;
        }
    } catch (err) {
        console.error(err.message);
        return false;
    }
};

const pollTask = (taskId, timeout, targetHost, targetPort) => {
    return new Promise((resolve) => {
        const start = new Date().getTime();
        let stop = start + timeout;
        let reqOptions = {
            method: 'GET',
            url: f5Gateway.f5_api_gw_extensions_uri + '/' + taskId,
            json: true
        };
        if (targetHost) {
            reqOptions = {
                method: 'POST',
                url: f5Gateway.f5_api_gw_proxy_url,
                body: {
                    "method": "Get",
                    "uri": f5Gateway.f5_bigip_extensions_uri(targetHost, targetPort) + '/' + taskId,
                },
                json: true
            };
        }
        const getStatus = () => {
            request(reqOptions, async (err, resp, body) => {
                if (err) {
                    console.error('Can not get status for task ' + taskId + ' - ' + err.message);
                    stop = 0;
                }
                if (resp.statusCode == 404) {
                    console.error('task:' + taskId + ' could not be found');
                    stop = 0;
                }
                if (body.status === FAILED) {
                    //deleteTasks(taskId, targetHost, targetPort);
                    resolve(body);
                    stop = 0;
                }
                if (body.status === FINISHED) {
                    //deleteTasks(taskId, targetHost, targetPort);
                    resolve(body);
                    stop = 0;
                }
                if (new Date().getTime() < stop) {
                    await wait(2000);
                    getStatus();
                } else {
                    //deleteTasks(taskId, targetHost, targetPort);
                    resolve();
                }
            });
        }
        setImmediate(getStatus);
    });
};

const deleteTasks = (taskId, targetHost, targetPort) => {
    return new Promise((resolve) => {
        if (!taskId) {
            taskId = '';
        }
        let reqOptions = {
            method: 'GET',
            url: f5Gateway.f5_api_gw_extensions_uri + '/' + taskId,
            json: true
        };
        if (targetHost) {
            reqOptions = {
                method: 'POST',
                url: f5Gateway.f5_api_gw_proxy_url,
                body: {
                    "method": "Get",
                    "uri": f5Gateway.f5_bigip_extensions_uri(targetHost, targetPort) + '/' + taskId,
                },
                json: true
            };
        }
        request(reqOptions, async (err, resp, body) => {
            if (err) {
                console.error('can not get task to delete: ' + taskId + ' - ' + err.message);
                resolve(false);
            }
            if (resp.statusCode == 404) {
                resolve(true);
            }
            let items = [];
            if ('items' in body) {
                items = body.items;
            } else {
                items.push(body);
            }
            const deletePromises = []
            items.map((task) => {
                if (task.status == FINISHED) {
                    const deletePromise = new Promise((resolve) => {
                        const taskId = task.id;
                        let deleteOptions = {
                            method: 'DELETE',
                            url: f5Gateway.f5_api_gw_extensions_uri + '/' + taskId,
                            json: true
                        };
                        if (targetHost) {
                            deleteOptions = {
                                method: 'POST',
                                url: f5Gateway.f5_api_gw_proxy_url,
                                body: {
                                    "method": "Delete",
                                    "uri": f5Gateway.f5_bigip_extensions_uri(targetHost, targetPort) + '/' + taskId,
                                },
                                json: true
                            };
                        }
                        request(deleteOptions, (err, resp, body) => {
                            if (resp.statusCode < 400) {
                                resolve(true);
                            } else {
                                if (resp.statusCode == 404) {
                                    resolve(true);
                                } else {
                                    console.log('could not delete task ' + taskId + ' status returned:' + resp.statusCode + ' - ');
                                    resolve(false);
                                }
                            }
                        })
                    })
                    deletePromises.push(deletePromise);
                }
            });
            Promise.all(deletePromises)
                .then(() => {
                    resolve();
                })
        });
    });
};

const getExtensionAttributes = (rpmFile) => {
    return new Promise((resolve) => {
        const queryCmd = rpmQueryCmd + STORAGE_PATH + '/' + rpmFile;
        exec(queryCmd, (err, stdout, stderr) => {
            if (err) {
                throw Error('error parsing attributes from rpmFile: ' + rpmFile + ' ' + stderr);
            }
            let attributes = {
                name: 'UNKNOWN',
                version: 'UNKNOWN',
                release: 'UNKNOWN'
            };
            const results = stdout.split(':');
            if (results.length == 3) {
                attributes = {
                    name: results[0],
                    version: results[1],
                    release: results[2]
                }
            }
            resolve(attributes);
        });
    });
}

const install = (rpmFile, targetHost, targetPort) => {
    return new Promise((resolve) => {
        let installOptions = {
            method: 'POST',
            url: f5Gateway.f5_api_gw_extensions_uri,
            json: true,
            body: {
                "operation": "INSTALL",
                "packageFilePath": "/var/config/rest/downloads/" + rpmFile
            }
        }
        if (targetHost) {
            installOptions = {
                method: 'POST',
                url: f5Gateway.f5_api_gw_proxy_url,
                body: {
                    "method": "Post",
                    "uri": f5Gateway.f5_bigip_extensions_uri(targetHost, targetPort),
                    "body": {
                        "operation": "INSTALL",
                        "packageFilePath": "/var/config/rest/downloads/" + rpmFile
                    }
                },
                json: true
            };
        }
        request(installOptions, function (err, resp, body) {
            if (err) {
                console.error('error posting install task:' + err);
                resolve(false);
            }
            if (body.hasOwnProperty('status')) {
                let taskId = body.id;
                pollTask(taskId, 20000, targetHost, targetPort)
                    .then((results) => {
                        if (results) {
                            if (results.status != FINISHED) {
                                if (results.hasOwnProperty('errorMessage') && results.errorMessage.includes('already installed')) {
                                    addExtensionByFileName(rpmFile);
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                            } else {
                                addExtensionByFileName(rpmFile);
                                resolve(true);
                            }
                        } else {
                            console.error('install task did not reach the FINISHED state');
                            resolve(false);
                        }
                    });
            } else {
                const err = 'error posting install, no status returned - ' + JSON.stringify(body);
                console.error(err);
                resolve(false);
            }
        });
    });
};

const uninstall = (packageName, targetHost, targetPort) => {
    return new Promise((resolve) => {
        let uninstallOptions = {
            method: 'POST',
            url: f5Gateway.f5_api_gw_extensions_uri,
            json: true,
            body: {
                "operation": "UNINSTALL",
                "packageName": packageName
            }
        }
        if (targetHost) {
            uninstallOptions = {
                method: 'POST',
                url: f5Gateway.f5_api_gw_proxy_url,
                body: {
                    "method": "Post",
                    "uri": f5Gateway.f5_bigip_extensions_uri(targetHost, targetPort),
                    body: {
                        "operation": "UNINSTALL",
                        "packageName": packageName
                    }
                },
                json: true
            }
        }
        request(uninstallOptions, function (err, resp, body) {
            if (err) {
                console.error('error posting uninstall task:' + err);
                resolve(false);
            }
            if (body.hasOwnProperty('status')) {
                let taskId = body.id;
                pollTask(taskId, 20000, targetHost, targetPort)
                    .then((results) => {
                        if (results.status != FINISHED) {
                            console.error('uninstall task did not reach the FINISHED state - ' + JSON.stringify(results));
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    });
            } else {
                const err = 'error posting uninstall, no status returned - ' + JSON.stringify(body);
                console.error(err);
                resolve(false);
            }
        });
    });
};

const getExtensions = (targetHost, targetPort) => {
    return new Promise((resolve) => {
        try {
            let queryOptions = {
                method: 'POST',
                url: f5Gateway.f5_api_gw_extensions_uri,
                body: {
                    "operation": "QUERY"
                },
                json: true
            };
            if (targetHost) {
                queryOptions = {
                    method: 'POST',
                    url: f5Gateway.f5_api_gw_proxy_url,
                    body: {
                        "method": "Post",
                        "uri": f5Gateway.f5_bigip_extensions_uri(targetHost, targetPort),
                        "body": {
                            "operation": "QUERY"
                        },
                        "headers": {
                            "Content-Type": "application/json"
                        }
                    },
                    json: true
                };
            }
            request(queryOptions, (err, resp, body) => {
                if (err) {
                    resolve([]);
                }
                if (body.hasOwnProperty('id')) {
                    let taskId = body.id;
                    pollTask(taskId, 20000, targetHost, targetPort)
                        .then((results) => {
                            if (results.status != FINISHED) {
                                resolve([]);
                            } else {
                                resolve(results.queryResponse);
                            }
                        });
                } else {
                    const err = 'error query task has no status returned - ' + JSON.stringify(body);
                    console.error(err);
                    resolve([]);
                }
            });
        } catch (err) {
            console.error('can not get extensions:' + err.message);
        }
    });
};

export default {
    async inventoryExtensionsFromStorage() {
        try {
            console.log('taking inventory of rpm files in ' + STORAGE_PATH);
            const inventoryPromises = [];
            listStorage().map((rpmFile) => {
                inventoryPromises.push(
                    extensionsController.getByFilename(rpmFile)
                    .then((extension) => {
                        if (!extension) {
                            console.log('adding extension ' + rpmFile + ' from storage');
                            inventoryPromises.push(createExtension('file://' + STORAGE_PATH + '/' + rpmFile, rpmFile));
                        }
                    })
                );
            });
            return await Promise.all(inventoryPromises);
        } catch (ex) {
            const err = 'error building inventory of extensions from storage - ' + ex.message;
            console.error(err);
            throw Error(err);
        }
    },
    async downloadExtensionToStorage(url) {
        try {
            return await storageDownload(url);
        } catch (ex) {
            const err = 'error downloading rpm file ' + url + ' to storage - ' + ex.message;
            console.error(err);
            throw Error(err);
        }
    },
    async removeExtensionFromStorage(rpmFile) {
        try {
            return await removeFileFromStorage(rpmFile);
        } catch (ex) {
            const err = 'error removing rpm file ' + rpmFile + ' from storage - ' + ex.message;
            console.error(err);
            throw Error(err);
        }
    },
    async inventoryExtensionsOnGateway() {
        try {
            const onGatewayExtensions = await getExtensions();
            const inventoryPromises = [];
            onGatewayExtensions.map((extension) => {
                inventoryPromises.push(addExtensionByFileName(extension.packageName + '.rpm'));
            })
            await Promise.all(inventoryPromises);
        } catch (ex) {
            const err = 'error getting inventory of existing extensions on gateway - ' + ex.message;
        }
    },
    async getExtensionsOnTrustedDevice(targetHost, targetPort) {
        try {
            return await getExtensions(targetHost, targetPort);
        } catch(ex) {
            const err = 'error getting existing extensions on trusted device - ' + ex.message;
            console.error(err);
        }
    },
    async inventoryExtensionsOnTrustedDevice(targetHost, targetPort) {
        try {
            const onTargetExtensions = await getExtensions(targetHost, targetPort);
            const inventoryPromises = [];
            onTargetExtensions.map((extension) => {
                inventoryPromises.push(addExtensionByFileName(extension.packageName + '.rpm', targetHost, targetPort));
            })
            await Promise.all(inventoryPromises);
        } catch (ex) {
            const err = 'error getting inventory of existing extensions on trusted device ' + targetHost + ':' + targetPort + ' - ' + ex.message;
        }
    },
    async inventoryExtensionsOnAllTrustedDevices() {
        try {
            const allDevices = await devicesController.getAll();
            const inventoryPromises = [];
            allDevices.map((device) => {
                inventoryPromises.push(this.inventoryExtensionsOnTrustedDevice(device.targetHost, device.targetPort));
            })
            await Promise.all(inventoryPromises);
        } catch (ex) {
            const err = 'error getting inventory of existing extensions on trusted device ' + targetHost + ':' + targetPort + ' - ' + ex.message;
        }
    },
    async installExtensionOnGateway(rpmFile) {
        try {
            if (rpmFile) {
                const existingExtensions = await getExtensions();
                let needToInstall = true;
                existingExtensions.map((extension) => {
                    if (rpmFile && rpmFile.startsWith(extension.packageName)) {
                        needToInstall = false;
                    }
                })
                if (needToInstall) {
                    if (!rpmFileExits(rpmFile)) {
                        throw Error('file: ' + rpmFile + ' does not exist in storage.');
                    }
                    const uploaded = await gatewayUpload(rpmFile);
                    if (uploaded) {
                        const installed = await install(rpmFile);
                        if (installed) {
                            return await extensionsController.getByFilename(rpmFile);
                        } else {
                            const err = 'file ' + rpmFile + ' did not successfully install on the ASG';
                            console.error(err);
                            throw Error(err);
                        }
                    } else {
                        const err = 'file ' + rpmFile + ' did not successfully upload to the ASG';
                        console.error(err);
                        throw Error(err);
                    }
                } else {
                    console.log('extension ' + rpmFile + ' is installed on the ASG');
                    return await addExtensionByFileName(rpmFile);
                }
            }
            return false;
        } catch (ex) {
            console.error('error installing extension on gateway - ' + ex.message);
            throw ex;
        }
    },
    async uninstallExtensionOnGateway(rpmFile) {
        try {
            const installed = await (getExtensions())
            installed.map(async (extension) => {
                if (rpmFile && rpmFile.startsWith(extension.packageName)) {
                    if (await uninstall(extension.packageName)) {
                        return true;
                    } else {
                        return false;
                    }
                }
            });
        } catch (ex) {
            console.error('error uninstalling extension on gateway - ' + ex.message);
            throw ex;
        }
    },
    async uninstallAllExtensionsOnGateway() {
        try {
            const installed = await (getExtensions())
            installed.map(async (extension) => {
                if (await uninstall(extension.packageName)) {
                    return true;
                } else {
                    return false;
                }
            });
            return true;
        } catch (ex) {
            console.error('error uninstalling extension on gateway - ' + ex.message);
            throw ex;
        }
    },
    async installExtensionOnTrustedDevice(rpmFile, targetHost, targetPort) {
        try {
            if (rpmFile) {
                let existingExtensions = await getExtensions(targetHost, targetPort);
                let needToInstall = true;
                existingExtensions.map((extension) => {
                    if (rpmFile && rpmFile.startsWith(extension.packageName)) {
                        needToInstall = false;
                    }
                })
                if (needToInstall) {
                    if (!rpmFileExits(rpmFile)) {
                        throw Error('file: ' + rpmFile + ' does not exist in storage.');
                    }
                    const uploaded = await trustedDeviceUpload(rpmFile, targetHost, targetPort);
                    if (uploaded) {
                        const installed = await install(rpmFile, targetHost, targetPort);
                        if (installed) {
                            return await extensionsController.getByFilename(rpmFile);;
                        } else {
                            const err = 'file ' + rpmFile + ' did not successfully install on the trusted device ' + targetHost + ':' + targetPort;
                            console.error(err);
                            throw Error(err);
                        }
                    } else {
                        const err = 'file ' + rpmFile + ' did not successfully upload to the trusted device ' + targetHost + ':' + targetPort;
                        console.error(err);
                        throw Error(err);
                    }
                } else {
                    console.log('extension ' + rpmFile + ' is installed on the trusted device ' + targetHost + ':' + targetPort);
                    return await addExtensionByFileName(rpmFile, targetHost, targetPort);
                }
            }
            return false;
        } catch (ex) {
            console.error('error installing extension on trusted device - ' + ex.message);
            throw ex;
        }
    },
    async uninstallExtensionOnTrustedDevice(rpmFile, targetHost, targetPort) {
        try {
            const installed = await (getExtensions(targetHost, targetPort));
            for(let i=0; i<installed.length; i++) {
                if (rpmFile && rpmFile.startsWith(installed[i].packageName)) {
                    return await uninstall(installed[i].packageName, targetHost, targetPort);
                }
            }
        } catch (ex) {
            console.error('error uninstalling extension on trusted device - ' + ex.message);
            throw ex;
        }
    },
    async uninstallAllExtensionsOnTrustedDevice(targetHost, targetPort) {
        try {
            const installed = await (getExtensions(targetHost, targetPort));
            for(let i=0; i<installed.length; i++) {
                if (await uninstall(installed[i].packageName, targetHost, targetPort)) {
                    return true;
                } else {
                    return false;
                }
            }
        } catch (err) {
            console.error('error uninstalling extension on gateway - ' + err.message);
            throw err;
        }
    },
    async clearGatewayExtensionTasks() {
        try {
            console.log('clearing FINISHED extensions tasks on gateway');
            return await deleteTasks();
        } catch (ex) {
            const err = 'error deleting all FINISHED gateway tasks - ' + ex.message;
            console.error(err);
            throw Error(err);
        }
    },
    async clearTrustedHostExtensionTasks(targetHost, targetPort) {
        try {
            return await deleteTasks('', targetHost, targetPort)
        } catch (ex) {
            const err = 'error deleting all FINISHED tusted host tasks - ' + ex.message;
            console.error(err);
            throw Error(err);
        }
    },
    async clearAllTrustedHostTasks() {
        try {
            const devices = await devicesServices.updateTrustedDevices();
            const clearPromises = [];
            devices.map((device) => {
                console.log('clearing FINISHED extensions tasks on ' + device.targetHost + ':' + device.targetPort);
                clearPromises.push(deleteTasks('', device.targetHost, device.targetPort));
            })
            await Promise.all(clearPromises);
        } catch (ex) {
            const err = 'error deleting all FINISHED tasks on trusted devices - ' + ex.message;
            console.error(err);
            throw Error(err);
        }
    }
}