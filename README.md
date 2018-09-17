# f5-appsvcs-demo
Demonstrating the Strength of API Gateways and iControlLX

## Building the Demonstration Container

The demonstration application requires a host with the following applications installed:

- git
- docker
- node
- npm
- docker-compose
- curl

Please reference those projects to install these applications on your machine. 

The repository also includes bash scripts to help in the container build which favor a linux host, but they are not required. 

First clone this repository to your local machine

```
git clone https://github.com/jgruber/f5-appsvcs-demo.git
```

Change directory into the repository directory and install applications dependancies and build a release distribution of the application.

```
cd f5-appsvcs-demo
npm install --save
npm run-script build
```

If all goes well, you now have a ```dist``` directory containing your build of the application. If you got errors, it is likely your machine is either not conntected to the Internet or your node and npm environment are out of date. Please consult the errors (that means Google them) and fix any issues.

We can now build the application container image locally.

```
docker build -t f5-appsvcs-demo:latest .
```

Optionally, after building the container image, you can ``` docker push ``` your local container to a docker image repository.

## Running the Demonstration Application

The container application is part of an overall microservice deployment and depends on the following other services being available at runtime.

| Service | What it Does |
| ---------- | ----------- | 
| mongodb |  Used to store you local user database (salted hashed), roles, deployments, and iControlLX extension catalog. Notice your BIG-IP credentials are never stored! |
| f5-api-services-gateway | Establishes trusted communicatoins with BIG-IP devices. Optionally it can also host iControlLX extensions which are designed to be used with as a gateway controller  | 

The following environment variables tell our containerized application how to communicate with these dependant services:

| Environment Variable | Default Value |
| ---------- | ----------- | 
| MONGODB_URL | mongodb://root:secret@mongo:27017/f5_appsvcs_demo |
| F5_API_GW_HOST | f5apigateway |
| F5_API_GW_HTTP_PORT | 8080 |

To support composability with a container orchestrator, like docker-compose or kubernetes, the default values use hostnames which can be created using linked containers.

### Running All Services with docker-compose ###

Ideally you would run all services in a deployment with linked containers. If the linked container names match the default host for the services listed above, all the default should work.  There is a ```docker-compose.yml``` file included in this repository which does exactly this. To run all these service together, simple run:

```docker-compose up```

in the repository directory. The service logs will stay in the forground.  To stop the services, from the respository directory issue the

``` docker-compose down```

command.

This is the preferred way to run the services as the f5-api-services-gateway container is only reachable from linked containers. This means that only linked applications can use the trusted signed communications to your BIG-IPs.

### How to Compose your Own Services - The Details ###

To start the container, set the environment variables to match your environment and use run the container. For a standalone host with mongodb running listening on all its default port:

```
mongod --bind_ip_all
``` 

and the f5-api-services-gateway started with the default docker run environment

```
docker run -p 8443:443 -p 8080:80 f5devcentral/f5-api-services-gateway
```

your docker run command would look something like this.

```
DEPLOYMENT_NAME=testappdemo
MONGODB_HOST=172.17.0.l
MONGODB_PORT=27017
F5_API_GW_HOST=172.17.0.1
F5_API_GW_HTTP_PORT=8080

docker run --name $DEPLOYMENT_NAME -p 3000:3000 \
-e MONGODB_URL=mongodb://$MONGODB_HOST:$MONGODB_PORT/f5_appsvcs_demo \
-e F5_API_GW_HOST=$F5_API_GW_HOST \
-e F5_API_GW_HTTP_PORT=$F5_API_GW_HTTP_PORT \
f5-appsvcs-demo:latest
```

This assumes your docker network is the default 172.17.0.0/24 network.

## Creating an Application User

You should now be able to access the application at http://localhost:3000, or the exposed port you used for the application container. All API access is through the ```/api/``` URI namespace.

The application requires all access to be authenticated, with the exception of the creation of the first user. The application does not ship with any default user accounts, but rather makes the first account you create user administrator. The role tag ```User Administrator``` is automatically added to the first user added through the ```users``` API service.

#### NOTE: All passwords must include both lower and upper case letters, a number, and at least one character in the following list: "!&#$*@():" ####

First test that your application indeed requires authentication by access the ```users``` API endpoint.

http://localhost:3000/api/users

You should be prompted for credentials. Cancel the prompt from you browser and you will see an Unauthorized HTTP 401 response. 

We will next create the user so you can supply credentials.

### Create and Admin User ###

```
curl -H 'Content-Type: application/json' -X POST http://localhost:3000/api/users -d '{"username": "admin", "password": "F5RocksAPIs!"}' 
```

Now you should be able to use your new created user to GET, POST (create), and PUT(update) users in the application.

```
curl -u 'admin:F5RocksAPIs!' -H 'Content-Type: application/json' -X GET http://localhost:3000/api/users
```

Notice your first user already has the role tag ```User Administrator```. 

Record the ```id``` attribute from your user. We will need that to update the roles in a minute.

## Adding a BIG-IP Administrator Role

In order to administer trusted BIG-IP devices through the applications ```/api/devices``` API, you will need to add the role tag ```BIGIP Administrator```.

You can see that if you try to access the ```/api/devices``` API endpoint with your current admin user.

Let's add the ```BIGIP Administrator``` tag to the admin user you just created.

```
curl -u 'admin:F5RocksAPIs!' -H 'Content-Type: application/json' -X PUT http://localhost:3000/api/users/[id] -d '{"roles": ["User Administrator", "BIGIP Administrator"]}' 
```

## Viewing the OpenAPI Documentation

TODO: Sprint Demo the week of 9-24-2018

## Adding BIG-IP Device Access to the Gateway

We can now add BIG-IP devices trusts through our application to the f5-api-service-gateway. Putting our web service application between the end user and the f5-api-services-gateway allow us define custom secutiry and access controls. The authentication framework the demo applicatoin uses is call [Express Middleware Passport](http://www.passportjs.org/). This framework has authentication modules which work with well over 100 different authentication sources including ldap, active directory, github, twitter, facebook, google, azure, aws, and others.

To add a device trust through the application's ```/api/devices`` API endpoints, we simply post our BIG-IP device definition and credentials. 

#### NOTE: You BIG-IP credentials are only used to establish the trust. They are not stored once the trust has been established. All iControl REST calls placed to your BIG-IP through the f5-api-serviecs gateway will use signed requests, not credentials ####

```
curl -u 'admin:F5RocksAPIs!' -H 'Content-Type: application/json' -X POST http://localhost:3000/api/devices -d '{"bigipHost": "172.13.1.103", "bigipPort":  443, "bigipUsername": "admin", "bigipPassword": "admin" }' 
```
 You will see your device restration trust in the ```PENDING``` state. You can query the ```/api/devices``` API endpoint to watch the trust status move to ```ACTIVE```. Once it is active, you can now securely make iControl REST calls through our application. 

```
curl -u 'admin:F5RocksAPIs!' -H 'Content-Type: application/json' -X GET http://localhost:3000/api/devices 
```

Record your BIG-IP id. This will be used to place iControl REST calls to your device.

## Testing iControl REST Trusted Access Through the Gateway

Once trust has been established, the demo application can use the trust to make all iControl REST calls. The application's ```/api/devices``` API enpoint supports the syntax:

```
GET /api/devices/[device id]/[iControl REST URI]

POST /api/devices/[device id]/[iControl REST URI]

PUT /api/devices/[device id]/[iControl REST URI]

PATCH /api/devices/[device id]/[iControl REST URI]

DELETE /api/devices/[device id]/[iControl REST URI]
```

You simply include the any body your iControl REST API requires and the resulting HTTP status code and content is proxied through the f5-api-services-gateway container.

As example, let's get your BIG-IP's Device Information struction using the iControl REST URI ```/mgmt/shared/identifies-devices/config/device-info```.  That means the trusted request through the applicaton would be of the form:

```
curl -u 'admin:F5RocksAPIs!' -H 'Content-Type: application/json' -X GET http://localhost:3000/api/devices/[device id]/mgmt/shared/identifies-devices/config/device-info
```

Put in your device ID from the application query and you should see a proxied communication through your application to your BIG-IP.

For a device with the ID: c61e1394-250c-451d-a1c2-fc0f7d1fa99a

Your call would look like:

```
curl -u 'admin:F5RocksAPIs!' -H 'Content-Type: application/json' -X GET  http://localhost:3000/api/devices/c61e1394-250c-451d-a1c2-fc0f7d1fa99a/mgmt/shared/identified-devices/config/device-info
```






## Creating a Deployment of Multiple BIG-IPs

TODO: Sprint Demo the week of 9-24-2018

## Publishing iControlLX Extensions to Deployments

TODO: Sprint Demo the week of 9-24-2018

## Adding a BIG-IP Tenant User

## Exposing iControlLX Extension to BIG-IP Tenants via Role Tags

TODO: Sprint Demo the week of 9-24-2018

## Allowing BIG-IP Tenant to Create OAUTH Clients

TODO: Sprint Demo the week of 10-1-2018

## Issuing iControlLX Extension Declarations from an OAUTH Client

TODO: Sprint Demo the week of 10-1-2018

## Restricting OAUTH Client Access through IAM Roles

TODO: Sprint Demo the week of 10-1-2018