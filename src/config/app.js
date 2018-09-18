const app_listening_port = process.env['F5_APPSVCS_DEMO_LISTEN_PORT'] || 3000;

const user_admin_role = process.env['USER_ADMIN_ROLE'] || 'User Administrator';
const f5_device_admin_role = process.env['F5_DEVICE_ADMIN_ROLE'] || 'BIGIP Administrator';
const f5_tenant_role = process.env['F5_TENANT_ROLE'] || 'BIGIP Tenant';


module.exports = {
    app_listening_port: app_listening_port,
    user_admin_role: user_admin_role,
    f5_device_admin_role: f5_device_admin_role,
    f5_tenant_role: f5_tenant_role
}