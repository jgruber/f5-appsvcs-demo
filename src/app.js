const appconf = require('./config/app');
const f5Gateway = require('./config/f5apigateway');
const path = require('path');
const serveIndex = require('serve-index');

import express from 'express';
import logger from 'morgan';
import swaggerUi from 'swagger-ui-express';
import devicesServices from './api/resources/devices/devices.services';
import extensionsServices from './api/resources/extensions/extensions.services';
import swaggerDocument from './config/swagger.json';

import {
    connect
} from './config/db';
import {
    restRouter
} from './api/resources';

const app = express();
const PORT = appconf.app_listening_port;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.use('/api', restRouter);
app.use('/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
        explorer: false
    })
);

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});
app.use('/html', express.static(path.join(__dirname, '../')), serveIndex(path.join(__dirname, '../'), {
    'icons': false
}));
console.log('adding /storage route for ' + appconf.extension_storage_path);
app.use('/storage', express.static(appconf.extension_storage_path), serveIndex(appconf.extension_storage_path, {
    'icons': false
}));

// default route handlers
app.use((req, res, next) => {
    const error = new Error('Not found');
    error.message = 'Invalid route';
    error.status = 404;
    next(error);
});
app.use((error, req, res, next) => {
    res.status(error.status || 400);
    return res.json({
        error: {
            message: error.message,
        },
    });
});

app.listen(PORT, () => {
    console.log(`Server is running at PORT http://localhost:${PORT}/api-docs/#/`);
});

// unique list of extension URLs to install
// list of unique urls

const getInstallExtensions = () => {
    const extensionsUrlIndexed = {};
    appconf.install_extensions.map((targetUrl) => {
        const target = {
            targetHost: 'none',
            targetPort: 'none',
            onGateway: true
        }
        if (targetUrl.hasOwnProperty('targetHost')) {
            target.targetHost = targetUrl.targetHost;
            if (targetUrl.hasOwnProperty('targetPort')) {
                target.targetPort = targetUrl.targetPort;
            } else {
                target.targetPort = 443;
            }
            target.onGateway = false;
        }
        if (extensionsUrlIndexed.hasOwnProperty(targetUrl.url)) {
            extensionsUrlIndexed[targetUrl.url].push(target);
        } else {
            extensionsUrlIndexed[targetUrl.url] = [target]
        }
    });
    return extensionsUrlIndexed;
}

const clearTasks = async () => {
    try {
        extensionsServices.clearGatewayExtensionTasks();
        extensionsServices.clearAllTrustedHostTasks();
    } catch (err) {
        console.error('can not clear tasks - ' + err.message);
    }
}

const installOnGateway = async (rpmFile) => {
    try {
        return await extensionsServices.installExtensionOnGateway(rpmFile);
    } catch (err) {
        console.error('could not install extension ' + rpmFile + ' on ASG');
        return false;
    }
}

const installOnTrustedDevice = async (rpmFile, targetHost, targetPort) => {
    const trustedDevice = await devicesServices.getTrustedDevice(target.targetHost, target.targetPort);
    if (trustedDevice && 'id' in trustedDevice) {
        return await extensionsServices.installExtensionOnTrustedDevice(rpmFile, target.targetHost, target.targetPort);
    } else {
        console.error(targetHost + ':' + targetPort + ' is not a trused device');
        return false;
    }
}

const downloadAndInstall = async () => {
    const installPromises = [];
    const extensionsUrlIndexed = getInstallExtensions();
    for (let url in extensionsUrlIndexed) {
        try {
            const rpmFile = await extensionsServices.downloadExtensionToStorage(url);
            if (rpmFile) {
                const targets = extensionsUrlIndexed[url];
                targets.map((target) => {
                    if (target.onGateway) {
                        installPromises.push(installOnGateway(rpmFile));
                    } else {
                        installPromises.push(installOnTrustedDevice(rpmFile, target.targetHost, target.targetPort));
                    }
                });
            } else {
                console.error('can not continue to install extension ' + url + ' because file could not downloadd to storage');
            }
        } catch (err) {
            console.error('could not install extensions - ' + err.message);
        }
    }
    await Promise.all(installPromises)
}

// connect to services
connect()
    .then(() => {
        devicesServices.awaitGateway()
            .then((reachable) => {
                if (!reachable) {
                    console.error('API Services Gateway did not response.. restarting');
                    process.exit(1);
                } else {
                    console.log('connected to ASG');
                    clearTasks()
                        .then(() => {
                            downloadAndInstall();
                        })
                }
            });
    });