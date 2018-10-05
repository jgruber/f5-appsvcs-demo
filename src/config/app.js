const app_listening_port = process.env['F5_APPSVCS_DEMO_LISTEN_PORT'] || 3000;

const user_admin_role = process.env['USER_ADMIN_ROLE'] || 'User Administrator';
const f5_device_admin_role = process.env['F5_DEVICE_ADMIN_ROLE'] || 'BIGIP Administrator';
const f5_tenant_role = process.env['F5_TENANT_ROLE'] || 'BIGIP Tenant';

const extension_create_status = 'REQUESTED';
const extension_delete_status = 'DELETING';
const extension_downloading_status = 'DOWNLOADING';
const extension_available_status = 'AVAILABLE';
const extension_error_status = 'ERROR';

const extension_storage_path = process.env['EXTENSION_STORAGE_PATH'] || '/extensions';


module.exports = {
    app_listening_port: app_listening_port,
    user_admin_role: user_admin_role,
    f5_device_admin_role: f5_device_admin_role,
    f5_tenant_role: f5_tenant_role,
    extension_create_status: extension_create_status,
    extension_delete_status: extension_delete_status,
    extension_downloading_status: extension_downloading_status,
    extension_available_status: extension_available_status,
    extension_error_status: extension_error_status,
    extension_storage_path: extension_storage_path
}