const user_admin_role = process.env['USER_ADMIN_ROLE'] || 'User Administrator';
const f5_device_admin_role = process.env['F5_DEVICE_ADMIN_ROLE'] || 'BIGIP Administrator';
const f5_tenant_role = process.env['F5_TENANT_ROLE'] || 'BIGIP Tenant';


module.exports = {
    user_admin_role: user_admin_role,
    f5_device_admin_role: f5_device_admin_role,
    f5_tenant_role: f5_tenant_role
}