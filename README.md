# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template


## Update ECS cluster capacity provider

``` bash
# update your existing cluster with capacity providers support
CLUSTER_NAME=fargate
SERVICE1_NAME=service1
SERVICE2_NAME=service2
FARGATE_WEIGHT=1
FARGATE_SPOT_WEIGHT=1
FARGATE_BASE=1
FARGATE_SPOT_BASE=0

# update the existing cluster
aws ecs put-cluster-capacity-providers --cluster ${CLUSTER_NAME}  \
--capacity-providers FARGATE FARGATE_SPOT \
--default-capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=${FARGATE_SPOT_WEIGHT},base=${FARGATE_SPOT_BASE} \
capacityProvider=FARGATE,weight=${FARGATE_WEIGHT},base=${FARGATE_BASE}

# update existing service 1
aws ecs update-service --cluster ${CLUSTER_NAME} --service ${SERVICE1_NAME} \
--capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=${FARGATE_SPOT_WEIGHT},base=${FARGATE_SPOT_BASE} \
capacityProvider=FARGATE,weight=${FARGATE_WEIGHT},base=${FARGATE_BASE} --force-new-deployment

# update existing service 2
aws ecs update-service --cluster ${CLUSTER_NAME} --service ${SERVICE2_NAME} \
--capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=${FARGATE_SPOT_WEIGHT},base=${FARGATE_SPOT_BASE} \
capacityProvider=FARGATE,weight=${FARGATE_WEIGHT},base=${FARGATE_BASE} --force-new-deployment

# describe the service1 to see its capacityProviderStrategy
aws ecs describe-services --cluster ${CLUSTER_NAME} --service ${SERVICE1_NAME} --query 'services[0].capacityProviderStrategy'

# describe the service2 to see its capacityProviderStrategy
aws ecs describe-services --cluster ${CLUSTER_NAME} --service ${SERVICE2_NAME} --query 'services[0].capacityProviderStrategy'
```