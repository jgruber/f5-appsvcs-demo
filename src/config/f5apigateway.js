const f5_api_gw_version = '1.0.0';
const f5_api_gw_build = '0.0.1';
const f5_api_gw_device_name = 'f5apigateway';
const f5_api_gw_host = process.env['F5_API_GW_HOST'] || 'localhost';
const f5_api_gw_http_port = process.env['F5_API_GW_HTTP_PORT'] || 8080;
const f5_api_gw_device_group = process.env['F5_API_GW_DEVICE_GROUP'] || 'dockerContainers';
const f5_api_gw_base_uri = 'http://' + f5_api_gw_host + ':' + f5_api_gw_http_port;
const f5_api_gw_device_uri = f5_api_gw_base_uri + '/mgmt/shared/identified-devices/config/device-info';
const f5_api_gw_device_group_uri = f5_api_gw_base_uri + '/mgmt/shared/resolver/device-groups/' + f5_api_gw_device_group;
const f5_api_gw_devices_uri = f5_api_gw_base_uri + '/mgmt/shared/resolver/device-groups/' + f5_api_gw_device_group + '/devices';
const f5_api_gw_cert_uri = f5_api_gw_base_uri + '/mgmt/shared/device-certificates';
const f5_api_gw_upload_uri = f5_api_gw_base_uri + '/mgmt/shared/file-transfer/uploads';
const f5_api_gw_extensions_uri = f5_api_gw_base_uri + '/mgmt/shared/iapp/package-management-tasks';
const f5_api_gw_proxy_url = f5_api_gw_base_uri + '/mgmt/shared/TrustedProxy';
const f5_api_gw_trusted_devices_url = f5_api_gw_base_uri + '/mgmt/shared/TrustedDevices';
const f5_api_gw_trusted_extensions_url = f5_api_gw_base_uri + '/mgmt/shared/TrustedExtensions';
const f5_bigip_base_uri = (bigip_host, bigip_port) => { return 'https://' + bigip_host + ':' + bigip_port; }
const f5_bigip_device_uri = (bigip_host, bigip_port) => { return 'https://' + bigip_host + ':' + bigip_port + '/mgmt/shared/identified-devices/config/device-info'; }
const f5_bigip_cert_uri = (bigip_host, bigip_port) => { return 'https://' + bigip_host + ':' + bigip_port + '/mgmt/shared/device-certificates'; }
const f5_hidden_device_properties = [
    "deviceUri",
    "managementAddress",
    "mcpDeviceName",
    "trustDomainGuid",
    "properties",
    "groupName",
    "kind",
    "selfLink",
    "lastUpdateMicros"
];
const f5_bigip_extensions_uri = (bigip_host, bigip_port) => { return 'https://' + bigip_host + ':' + bigip_port + '/mgmt/shared/iapp/package-management-tasks'; }
const f5_bigip_upload_uri = (bigip_host, bigip_port) => { return 'https://' + bigip_host + ':' + bigip_port + '/mgmt/shared/file-transfer/uploads'; }

module.exports = {
    f5_api_gw_version: f5_api_gw_version,
    f5_api_gw_build: f5_api_gw_build,
    f5_api_gw_device_name: f5_api_gw_device_name,
    f5_api_gw_host: f5_api_gw_host,
    f5_api_gw_http_port: f5_api_gw_http_port,
    f5_api_gw_device_group: f5_api_gw_device_group,
    f5_api_gw_base_uri: f5_api_gw_base_uri,
    f5_api_gw_device_uri: f5_api_gw_device_uri,
    f5_api_gw_device_group_uri: f5_api_gw_device_group_uri,
    f5_api_gw_devices_uri: f5_api_gw_devices_uri,
    f5_api_gw_cert_uri: f5_api_gw_cert_uri,
    f5_api_gw_upload_uri: f5_api_gw_upload_uri,
    f5_api_gw_extensions_uri: f5_api_gw_extensions_uri,
    f5_api_gw_proxy_url: f5_api_gw_proxy_url,
    f5_api_gw_trusted_devices_url: f5_api_gw_trusted_devices_url,
    f5_api_gw_trusted_extensions_url: f5_api_gw_trusted_extensions_url,
    f5_bigip_base_uri: f5_bigip_base_uri,
    f5_bigip_device_uri: f5_bigip_device_uri,
    f5_bigip_cert_uri: f5_bigip_cert_uri,
    f5_hidden_device_properties: f5_hidden_device_properties,
    f5_bigip_extensions_uri: f5_bigip_extensions_uri,
    f5_bigip_upload_uri: f5_bigip_upload_uri
}
