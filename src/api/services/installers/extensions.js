import extensionsController from '../../resources/extensions/extensions.controller';
import Device from '../../resources/devices/devices.model';
const f5Gateway = require('../../../config/f5apigateway');
const appconf = require('../../../config/app');
const {
    exec
} = require('child_process');

const fs = require('fs');
const path = require('path');
const url = require('url');
const request = require('request');
const http = require('http');

const EXT_STORAGE_PATH = appconf.extension_storage_path;
const EXT_DOWNLOADING = appconf.extension_downloading_status;
const EXT_AVAILABLE = appconf.extension_available_status;
const EXT_ERROR = appconf.extension_error_status;

const rpmquery = '/bin/rpm -qp ';

const rpmFileExits = (rpmFile) => {
    if (!fs.path.existsSync(EXT_STORAGE_PATH)) {
        fs.mkdirSync(EXT_STORAGE_PATH, '0744');
        return false
    } else {
        if (fs.existsSync(EXT_STORAGE_PATH + '/' + rpmFile)) {
            return true;
        } else {
            return false;
        }
    }
};

const multipartGatewayUpload = (rpmFile, cb) => {
    const filename = EXT_STORAGE_PATH + '/' + rpmFile;
    const upload_uri = f5Gateway.f5_api_gw_upload_uri + '/' + rpmFile;
    const fstats = fs.statSync(filename);
    const CHUNK_SIZE = 1000000;
    const purl = url.parse(upload_uri);
    const opts = {
        host: purl.hostname,
        port: purl.port,
        path: purl.path,
        method: 'POST'
    }
    const upload_part = (start, end) => {
        const req = http.request(opts, (res) => {
            res.setEncoding('utf8');
            const resbuf = new ResponseBuffer();
            res.pipe(resbuf);
            res.on('end', () => {
                const error = checkForHttpError(res);
                if (error) {
                    error.body = resbuf.text;
                    if (cb) cb(error);
                    return;
                }

                if (end === fstats.size - 1) {
                    if (cb) cb();
                } else {
                    const next_start = start + CHUNK_SIZE;
                    const next_end = (() => {
                        if (end + CHUNK_SIZE > fstats.size - 1)
                            return fstats.size - 1
                        return end + CHUNK_SIZE
                    })()
                    upload_part(next_start, next_end);
                }
            });
        });
        req.on('error', (err) => {
            if (cb) cb(err);
        });
        req.setHeader('Content-Type', 'application/octet-stream');
        req.setHeader('Content-Range', start + '-' + end + '/' + fstats.size);
        req.setHeader('Content-Length', (end - start) + 1);
        const fstream = fs.createReadStream(file_path, {
            start: start,
            end: end
        });
        fstream.on('end', () => {
            req.end();
        });
        fstream.pipe(req);
    }
    setImmediate(() => {
        if (CHUNK_SIZE < fstats.size)
            upload_part(0, CHUNK_SIZE - 1);
        else
            upload_part(0, fstats.size - 1);
    });
}

const multipartDeviceUpload = async (deviceId, rpmFile, cb) => {
    try {
        const device = await Device.getTrustById(deviceId);
        if (device) {
            const filename = EXT_STORAGE_PATH + '/' + rpmFile;
            const upload_uri = f5Gateway.f5_bigip_upload_uri(device.bigipHost, device.bigipPort);
            const fstats = fs.statSync(file_path);
            const CHUNK_SIZE = 1000000;
            // get local gateway proxy 
            

        } else {
            const err = 'No device trust defined for id:' + deviceId;
            console.error(err);
            throw Error(err);
        }
    } catch(ex) {
        const err = 'error uploading ' + rpmFile + ' to device: ' + deviceId + ' - ' + ex;
        console.error(err);
        throw Error(err);
    }
    
    const opts = {
        host: purl.hostname,
        port: purl.port,
        path: purl.path,
        method: 'POST'
    }
    const upload_part = (start, end) => {
        const req = http.request(opts, (res) => {
            res.setEncoding('utf8');
            const resbuf = new ResponseBuffer();
            res.pipe(resbuf);
            res.on('end', () => {
                const error = checkForHttpError(res);
                if (error) {
                    error.body = resbuf.text;
                    if (cb) cb(error);
                    return;
                }

                if (end === fstats.size - 1) {
                    if (cb) cb();
                } else {
                    const next_start = start + CHUNK_SIZE;
                    const next_end = (() => {
                        if (end + CHUNK_SIZE > fstats.size - 1)
                            return fstats.size - 1
                        return end + CHUNK_SIZE
                    })()
                    upload_part(next_start, next_end);
                }
            });
        });
        req.on('error', (err) => {
            if (cb) cb(err);
        });
        req.setHeader('Content-Type', 'application/octet-stream');
        req.setHeader('Content-Range', start + '-' + end + '/' + fstats.size);
        req.setHeader('Content-Length', (end - start) + 1);
        const fstream = fs.createReadStream(file_path, {
            start: start,
            end: end
        });
        fstream.on('end', () => {
            req.end();
        });
        fstream.pipe(req);
    }
    setImmediate(() => {
        if (CHUNK_SIZE < fstats.size)
            upload_part(0, CHUNK_SIZE - 1);
        else
            upload_part(0, fstats.size - 1);
    });
}

export default {
    async extensionFileExists(url) {
        try {
            const extension = extensionsController.findByURL(url);
            if (extension) {
                return rpmFileExits(extension.filename);
            } else {
                return false;
            }
        } catch (ex) {
            const err = 'error checking if extension file for URL ' + url + ' exists - ' + ex;
            console.error(err);
            try {
                await extensionsController.updateStatusByURL(url, EXT_ERROR);
            } catch (ue) {
                console.error('could not update extension status to error - ' + ue);
                return false;
            }
            return false;
        }
    },
    async extensionFileDownload(url) {
        try {
            await extensionsController.updateStatusByURL(url, EXT_DOWNLOADING);
            const default_file_name = path.basename(url.parse(url).pathname);
            const get_options = {
                url: url,
                encoding: null,
                resolveWithFullResponse: true,
                headers: {
                    'accept-encoding': 'identity'
                }
            }
            request.get(get_options)
                .on('response', function (res) {
                    if (res.statusCode === 200) {
                        try {
                            let contentDisposition = res.headers['content-disposition'];
                            let match = contentDisposition && contentDisposition.match(/(filename=|filename\*='')(.*)$/);
                            let filename = match && match[2] || default_file_name;
                            // await extensionFileDelete(filename);
                            let dest = fs.createWriteStream(EXT_STORAGE_PATH + "/" + filename);
                            dest.on('error', function (err) {
                                console.error(err);
                                try {
                                    // await extensionsController.updateStatusByURL(url, EXT_ERROR);
                                } catch (ue) {
                                    console.error('could not update extension status to error - ' + ue);
                                    return false;
                                }
                                return false;
                            });
                            dest.on('finish', function () {
                                console.log('Downloaded ' + filename);
                                extensionsController.updateStatusByURL(url, EXT_AVAILABLE);
                                try {
                                    // await extensionsController.updateStatusByURL(url, EXT_AVAILABLE);
                                } catch (ue) {
                                    console.error('could not update extension status to available - ' + ue);
                                    return false;
                                }
                                return true;
                            })
                            res.pipe(dest);
                        } catch (ex) {
                            const err = 'error downloading and saving ' + url + ' - ' + ex;
                            console.error(err);
                            try {
                                // await extensionsController.updateStatusByURL(url, EXT_ERROR);
                            } catch (ue) {
                                console.error('could not update extension status to error - ' + ue);
                                return false;
                            }
                            return false;
                        }
                    } else {
                        console.error('download attempt for ' + url + ' returned status ' + res.statusCode);
                        try {
                            // await extensionsController.updateStatusByURL(url, EXT_ERROR);
                        } catch (ue) {
                            console.error('could not update extension status to error - ' + ue);
                            return false;
                        }
                        return false;
                    }
                });
        } catch (ex) {
            const err = 'error downloading extension file ' + url + ' - ' + ex;
            console.error(err);
            try {
                await extensionsController.updateStatusByURL(url, EXT_ERROR);
            } catch (ue) {
                console.error('could not update extension status to error - ' + ue);
                return false;
            }
            return false;
        }
    },
    async extensionFileDelete(rpmFile) {
        try {
            if (rpmFileExits(rpmFile)) {
                fs.unlinkSync(rpmFile);
            }
            return true;
        } catch (ex) {
            const err = 'error deleting extension file ' + rpmFile + ' - ' + ex;
            console.error(err);
            return false;
        }
    },
    async queryExtensionOnGateway() {
        try {
            // const ext_uri = 
            const create_task_body = {
                operation: "QUERY"
            }
            const create_task_options = {
                url: f5Gateway.f5_api_gw_extensions_uri,
                body: {
                    "operation": "QUERY"
                },
                json: true
            };
            request.post(create_task_options, (err, resp, body) => {
                if (err) {
                    console(err);
                    throw Error(err);
                }
                if (body.hasOwnProperty('id')) {
                    const query_task_options = {
                        url: f5Gateway.f5_api_gw_extensions_uri + '/' + body.id,
                        json: true
                    }
                    request.get(query_task_options, (err, resp, body) => {
                        if (body.hasOwnProperty('queryResponse')) {
                            return body.queryResponse;
                        } else {
                            const err = 'query response is invalid:' + body;
                            console.error(err);
                            throw Error(err);
                        }
                    })
                } else {
                    const err = 'can not create query task for extensions: ' + body;
                    console.error(err);
                    throw Error(err);
                }
            });
        } catch (ex) {
            const err = 'error querying extensions on gateway - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async queryExtentionTaskStatusOnGateway(taskId) {
        try {
            const query_task_options = {
                url: f5Gateway.f5_api_gw_extensions_uri + '/' + taskId,
                json: true
            }
            request.get(query_task_options, (err, resp, body) => {
                if (body.hasOwnProperty('status')) {
                    return body.status;
                } else {
                    const err = 'query status is invalid:' + body;
                    console.error(err);
                    throw Error(err);
                }
            })
        } catch (ex) {
            const err = 'error querying gateway task ' + taskId + ' status:' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async uploadExtensionToGateway(rpmFile) {
        try {
            if (rpmFileExits(rpmFile)) {
                multipartGatewayUpload(rpmFile, function (err) {
                    console.error(err);
                    throw Error(err);
                })
            } else {
                const err = 'file ' + rpmFile + ' does not exist on gateway to upload to device ' + deviceId;
                console.error(err);
                throw Error(err);
            }
        } catch (ex) {
            const err = 'error uploading rpm file ' + rpmFile + ' to gateway - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async installExtensionOnGateway(rpmFile) {
        try {
            const ext_uri = f5Gateway.f5_api_gw_extensions_uri
            const job_options = {
                url: ext_uri,
                json: true,
                body: {
                    "operation": "INSTALL",
                    "packageFilePath": "/mgmt/shared/file-transfer/uploads/" + rpmFile
                }
            }
            request.post(job_options, function (err, resp, body) {
                if (err) {
                    console.error('error posting install task:' + err);
                    throw Error('error posting install task:' + err);
                }
                if (body.hasOwnProperty('status')) {
                    let taskId = body.id;
                    let status = body.status;
                    while (status === 'STARTED') {
                        setTimeout(function () {
                            // status = await queryExtentionTaskStatusOnGateway(taskId);
                        }, 2000);
                    }
                    if (status === 'FINISHED') {
                        return true;
                    } else {
                        const err = 'packing installation task ' + taskId + ' status :' + status;
                        console.error(err);
                        throw Error(err);
                    }
                } else {
                    const err = 'error posting install, no status returned: ' + body;
                    console.error(err);
                    throw Error(err);
                }
            });
        } catch (ex) {
            const err = 'error installing extension on gateway - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async uninstallExtensionOnGateway(packageName) {
        try {
            const ext_uri = f5Gateway.f5_bigip_extensions_uri(bigipHost, bigipPort)
            const job_options = {
                url: ext_uri,
                json: true,
                body: {
                    "operation": "UNINSTALL",
                    "packageName": packageName
                }
            }
            request.post(job_options, function (err, resp, body) {
                if (err) {
                    console.error('error posting uninstall task:' + err);
                    throw Error('error posting uninstall task:' + err);
                }
                if (body.hasOwnProperty('status')) {
                    let taskId = body.id;
                    let status = body.status;
                    while (status === 'STARTED') {
                        setTimeout(function () {
                            // status = await queryExtentionTaskStatusOnGateway(taskId);
                        }, 2000);
                    }
                    if (status === 'FINISHED') {
                        return true;
                    } else {
                        const err = 'packing uninstall task ' + taskId + ' status :' + status;
                        console.error(err);
                        throw Error(err);
                    }
                } else {
                    const err = 'error posting uninstall, no status returned: ' + body;
                    console.error(err);
                    throw Error(err);
                }
            });
        } catch (ex) {
            const err = 'error uninstalling extension on gateway - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async queryExtensionOnDevice(deviceId) {
        try {
            const device = await Device.getTrustById(deviceId);
            if (device) {
                const ext_uri = f5Gateway.f5_bigip_extensions_uri(device.bigipHost, device.bigipPort)
                const create_task_body = {
                    operation: "QUERY"
                }
                Device.post(deviceId, ext_uri, create_task_body)
                    .then((pres) => {
                        const task_err = pres.err;
                        const task_res = pres.resp;
                        const task_body = pres.body;
                        if (task_err) {
                            console.log(task_err);
                            throw Error(task_err);
                        }
                        if (task_body.hasOwnProperty('id')) {
                            Device.get(deviceId, ext_uri + '/' + task_body.id)
                                .then((pres) => {
                                    const query_err = pres.err;
                                    const query_res = pres.resp;
                                    const query_body = pres.body;
                                    if (query_body.hasOwnProperty('queryResponse')) {
                                        return query_body.queryResponse;
                                    } else {
                                        const err = 'query response is invalid:' + query_body;
                                        console.error(err);
                                        throw Error(err);
                                    }
                                });
                        } else {
                            const err = 'can not create query task for extensions: ' + task_body;
                            console.error(err);
                            throw Error(err);
                        }
                    });
            } else {
                const err = 'No device trust defined for id:' + deviceId;
                console.error(err);
                throw Error(err);
            }
        } catch (ex) {
            const err = 'error querying extension on device: ' + deviceId + ' - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async queryExtentionTaskStatusOnDevice(deviceId, taskId) {
        try {
            const device = await Device.getTrustById(deviceId);
            if (device) {
                const ext_uri = f5Gateway.f5_bigip_extensions_uri(device.bigipHost, device.bigipPort)
                Device.get(deviceId, ext_uri + '/' + taskId)
                    .then((pres) => {
                        const query_err = pres.err;
                        const query_res = pres.resp;
                        const query_body = pres.body;
                        if (query_body.hasOwnProperty('status')) {
                            return query_body.status
                        } else {
                            const err = 'query status is invalid:' + query_body;
                            console.error(err);
                            throw Error(err);
                        }
                    });
            } else {
                const err = 'No device trust defined for id:' + deviceId;
                console.error(err);
                throw Error(err);
            }
        } catch (ex) {
            const err = 'error querying device ' + deviceId + ' task ' + taskId + ' status:' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async uploadeExtensionToDevice(deviceId, rpmFile) {
        try {
            const device = await Device.getTrustById(deviceId);
            if (device) {
                //TODO: multipart upload
            } else {
                const err = 'No device trust defined for id:' + deviceId;
                console.error(err);
                throw Error(err);
            }
        } catch (ex) {
            const err = 'error uploading rpm file ' + rpmFile + ' to device: ' + deviceId + ' - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async installExtensionOnDevice(deviceId, rpmFile) {
        try {
            const device = await Device.getTrustById(deviceId);
            if (device) {
                const ext_uri = f5Gateway.f5_bigip_extensions_uri(device.bigipHost, device.bigipPort)
                const job_options = {
                    url: ext_uri,
                    json: true,
                    body: {
                        "operation": "INSTALL",
                        "packageFilePath": "/mgmt/shared/file-transfer/uploads/" + rpmFile
                    }
                };
                request.post(job_options, function (err, resp, body) {
                    if (err) {
                        console.error('error posting install task:' + err);
                        throw Error('error posting install task:' + err);
                    }
                    if (body.hasOwnProperty('status')) {
                        let taskId = body.id;
                        let status = body.status;
                        while (status === 'STARTED') {
                            setTimeout(function () {
                                // status = await queryExtentionTaskStatusOnDevice(deviceId, taskId);
                            }, 2000);
                        }
                        if (status === 'FINISHED') {
                            return true;
                        } else {
                            const err = 'packing installation task ' + taskId + ' status :' + status;
                            console.error(err);
                            throw Error(err);
                        }
                    } else {
                        const err = 'error posting install, no status returned: ' + body;
                        console.error(err);
                        throw Error(err);
                    }
                });
            } else {
                const err = 'No device trust defined for id:' + deviceId;
                console.error(err);
                throw Error(err);
            }
        } catch (ex) {
            const err = 'error installing extension on device: ' + deviceId + ' - ' + ex;
            console.error(err);
            throw Error(err);
        }
    },
    async uninstallExtensionOnDevice(deviceId, packageName) {
        try {
            const device = await Device.getTrustById(deviceId);
            if (device) {
                const ext_uri = f5Gateway.f5_bigip_extensions_uri(device.bigipHost, device.bigipPort)
                const job_options = {
                    url: ext_uri,
                    json: true,
                    body: {
                        "operation": "UNINSTALL",
                        "packageName": packageName
                    }
                };
                request.post(job_options, function (err, resp, body) {
                    if (err) {
                        console.error('error posting install task:' + err);
                        throw Error('error posting install task:' + err);
                    }
                    if (body.hasOwnProperty('status')) {
                        let taskId = body.id;
                        let status = body.status;
                        while (status === 'STARTED') {
                            setTimeout(function () {
                                // status = await queryExtentionTaskStatusOnDevice(deviceId, taskId);
                            }, 2000);
                        }
                        if (status === 'FINISHED') {
                            return true;
                        } else {
                            const err = 'packing installation task ' + taskId + ' status :' + status;
                            console.error(err);
                            throw Error(err);
                        }
                    } else {
                        const err = 'error posting install, no status returned: ' + body;
                        console.error(err);
                        throw Error(err);
                    }
                });
            } else {
                const err = 'No device trust defined for id:' + deviceId;
                console.error(err);
                throw Error(err);
            }
        } catch (ex) {
            const err = 'error uninstalling extension on device: ' + deviceId + ' - ' + ex;
            console.error(err);
            throw Error(err);
        }
    }
}