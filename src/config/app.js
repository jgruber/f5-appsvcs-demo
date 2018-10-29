const app_listening_port = process.env['F5_APPSVCS_DEMO_LISTEN_PORT'] || 3000;

const user_admin_role = process.env['USER_ADMIN_ROLE'] || 'User Administrator';
const f5_device_admin_role = process.env['F5_DEVICE_ADMIN_ROLE'] || 'BIGIP Administrator';
const f5_tenant_role = process.env['F5_TENANT_ROLE'] || 'BIGIP Tenant';

const extension_create_status = 'REQUESTED';
const extension_delete_status = 'DELETING';
const extension_downloading_status = 'DOWNLOADING';
const extension_file_exists_status = 'FILEEXISTS';
const extension_uploading_status = 'UPLOADING';
const extension_installing_status = 'INSTALLING';
const extension_uninstalling_status = 'UNINSTALLING';
const extension_available_status = 'AVAILABLE';
const extension_error_status = 'ERROR';

const extension_storage_path = process.env['EXTENSION_STORAGE_PATH'] || '/tmp/extensions';
const extension_valid_protocols = ['file:', 'http:', 'https:'];

const fs = require('fs');

// dev evn for npm start
let filebase = process.cwd() + '/src';
// prod container from dist npm prune production
if(fs.existsSync('/dist/icontrollx')) {
   filebase = '/dist'; 
}

const install_extensions = [
    {url: 'file://' + filebase + '/icontrollx/TrustedDevices/build/RPMS/noarch/TrustedDevices-1.0.0-0001.noarch.rpm'},
    {url: 'file://' + filebase + '/icontrollx/TrustedProxy/build/RPMS/noarch/TrustedProxy-1.0.0-0001.noarch.rpm'},
    {url: 'file://' + filebase + '/icontrollx/TrustedExtensions/build/RPMS/noarch/TrustedExtensions-1.0.0-0001.noarch.rpm'},
    {url: 'https://github.com/F5Networks/f5-appsvcs-extension/releases/download/v3.5.0/f5-appsvcs-3.5.0-3.noarch.rpm'},
    {url: 'https://github.com/F5Networks/f5-appsvcs-extension/releases/download/v3.5.0/f5-appsvcs-3.5.0-3.noarch.rpm', targetHost: '172.13.1.107', targetPort: 443},
    {url: 'https://github.com/F5Networks/f5-appsvcs-extension/releases/download/v3.5.0/f5-appsvcs-3.5.0-3.noarch.rpm', targetHost: '172.13.1.103', targetPort: 443}
];

module.exports = {
    app_listening_port: app_listening_port,
    user_admin_role: user_admin_role,
    f5_device_admin_role: f5_device_admin_role,
    f5_tenant_role: f5_tenant_role,
    extension_create_status: extension_create_status,
    extension_delete_status: extension_delete_status,
    extension_downloading_status: extension_downloading_status,
    extension_file_exists_status: extension_file_exists_status,
    extension_uploading_status: extension_uploading_status,
    extension_installing_status: extension_installing_status,
    extension_uninstalling_status: extension_uninstalling_status,
    extension_available_status: extension_available_status,
    extension_error_status: extension_error_status,
    extension_storage_path: extension_storage_path,
    extension_valid_protocols: extension_valid_protocols,
    install_extensions: install_extensions
}