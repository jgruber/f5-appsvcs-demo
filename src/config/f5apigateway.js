const f5_api_gw_host = process.env['F5_API_GW_HOST'] || 'f5apigateway';
const f5_api_gw_http_port = process.env['F5_API_GW_HTTP_PORT'] || 8080;
const f5_api_gw_device_group = process.env['F5_API_GW_DEVICE_GROUP'] || 'app1';
const f5_api_gw_base_uri = 'http://' + f5_api_gw_host + ':' + f5_api_gw_http_port;
const f5_api_gw_device_uri = f5_api_gw_base_uri + '/mgmt/shared/identified-devices/config/device-info';
const f5_api_gw_device_group_uri = f5_api_gw_base_uri + '/mgmt/shared/resolver/device-groups/' + f5_api_gw_device_group;
const f5_api_gw_devices_uri = f5_api_gw_base_uri + '/mgmt/shared/resolver/device-groups/' + f5_api_gw_device_group + '/devices';
const f5_api_gw_cert_uri = f5_api_gw_base_uri + '/mgmt/shared/device-certificates';
const f5_api_gw_proxy_url = f5_api_gw_base_uri + '/mgmt/shared/test/proxy-js';
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

module.exports = {
    f5_api_gw_host: f5_api_gw_host,
    f5_api_gw_http_port: f5_api_gw_http_port,
    f5_api_gw_device_group: f5_api_gw_device_group,
    f5_api_gw_base_uri: f5_api_gw_base_uri,
    f5_api_gw_device_uri: f5_api_gw_device_uri,
    f5_api_gw_device_group_uri: f5_api_gw_device_group_uri,
    f5_api_gw_devices_uri: f5_api_gw_devices_uri,
    f5_api_gw_cert_uri: f5_api_gw_cert_uri,
    f5_api_gw_proxy_url: f5_api_gw_proxy_url,
    f5_bigip_base_uri: f5_bigip_base_uri,
    f5_bigip_device_uri: f5_bigip_device_uri,
    f5_bigip_cert_uri: f5_bigip_cert_uri,
    f5_hidden_device_properties: f5_hidden_device_properties
}
