import * as cdk from '@aws-cdk/core';

import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';

export class CdkMsgAppBackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    
    // Example of resource, DynamoDB Table
    
    const table = new dynamodb.Table(this, 'Messages', {
      partitionKey: {
        name: 'app_id',
        type: dynamodb.AttributeType.STRING
      }, 
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.NUMBER
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
    });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    
    
    // Create VPC with two public subnets and two private subnets
    
    const vpc = new ec2.Vpc(this, "workshop-vpc", {
      cidr: "10.1.0.0/16",
      natGateways: 1,
      subnetConfiguration: [
        {  cidrMask: 24, subnetType: ec2.SubnetType.PUBLIC, name: "Public" },
        {  cidrMask: 24, subnetType: ec2.SubnetType.PRIVATE, name: "Private" }
        ],
      maxAzs: 3 // Default is all AZs in region
    });
    
    // Create container image repositories
    
    const repository1 = new ecr.Repository(this, "workshop-api-1", {
      repositoryName: "workshop-api-1"
    });
    
    const repository2 = new ecr.Repository(this, "workshop-api-2", {
      repositoryName: "workshop-api-2"
    });
    
    // Create ECS Cluster, to use Fargate Spot use the cli to update the capacity provider: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html#fargate-capacity-providers-existing-cluster
    
    const cluster = new ecs.Cluster(this, "MyCluster", {
      vpc: vpc
    });
    
    // Create Execution Policy to add to Task Definition
    
    const executionRolePolicy =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ]
    });

    ///////////////////////////////////////////////////
    // Create Service Container for workshop-api-1
    ///////////////////////////////////////////////////

    const fargateTaskDefinition1 = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition1', {
      memoryLimitMiB: 1024,
      cpu: 512
    });
    
    fargateTaskDefinition1.addToExecutionRolePolicy(executionRolePolicy);
    fargateTaskDefinition1.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [table.tableArn],
      actions: ['dynamodb:*']
    }));
    
    fargateTaskDefinition1.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['logs:*']
    }));

    const container1 = fargateTaskDefinition1.addContainer("workshop-api-1", {
      image: ecs.ContainerImage.fromRegistry(repository1.repositoryUri),
      logging: ecs.LogDrivers.awsLogs({streamPrefix: 'workshop-api-1'}),
      environment: { 
        'DYNAMODB_MESSAGES_TABLE': table.tableName,
        'APP_ID' : 'my-app'
      }
    });

    container1.addPortMappings({
      containerPort: 8080
    });
    
    const sg_service1 = new ec2.SecurityGroup(this, 'MySGService1', { vpc: vpc });
    sg_service1.addIngressRule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(8080));

    const service1 = new ecs.FargateService(this, 'Service1', {
      cluster: cluster,
      taskDefinition: fargateTaskDefinition1,
      desiredCount: 6,
      assignPublicIp: false,
      securityGroup: sg_service1
    });

    // Setup AutoScaling policy
    const scaling1 = service1.autoScaleTaskCount({ maxCapacity: 10, minCapacity: 6 });
    scaling1.scaleOnCpuUtilization('CpuScaling1', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });
    
    
    
    ///////////////////////////////////////////////////
    // Create Service Container for workshop-api-2
    ///////////////////////////////////////////////////

    const fargateTaskDefinition2 = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition2', {
      memoryLimitMiB: 1024,
      cpu: 512
    });
    
    fargateTaskDefinition2.addToExecutionRolePolicy(executionRolePolicy);
    fargateTaskDefinition2.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [table.tableArn],
      actions: ['dynamodb:*']
    }));
    
    fargateTaskDefinition2.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['logs:*']
    }));

    const container2 = fargateTaskDefinition2.addContainer("workshop-api-2", {
      image: ecs.ContainerImage.fromRegistry(repository2.repositoryUri),
      logging: ecs.LogDrivers.awsLogs({streamPrefix: 'workshop-api-2'}),
      environment: { 
        'DYNAMODB_MESSAGES_TABLE': table.tableName,
        'APP_ID' : 'my-app'
      }
    });

    container2.addPortMappings({
      containerPort: 8080
    });
    
    const sg_service2 = new ec2.SecurityGroup(this, 'MySGService2', { vpc: vpc });
    sg_service2.addIngressRule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(8080));

    const service2 = new ecs.FargateService(this, 'Service2', {
      cluster: cluster,
      taskDefinition: fargateTaskDefinition2,
      desiredCount: 6,
      assignPublicIp: false,
      securityGroup: sg_service2
    });

    // Setup AutoScaling policy
    const scaling2 = service2.autoScaleTaskCount({ maxCapacity: 10, minCapacity: 6 });
    scaling2.scaleOnCpuUtilization('CpuScaling2', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });
    
    
    ///////////////////////////////////////////////////
    // Create Load Balancer for the ECS services
    ///////////////////////////////////////////////////
    
    const lb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true
    });

    const listener = lb.addListener('Listener', {
      port: 80,
    });

    listener.addTargets('Target1', {
      port: 80,
      targets: [service1],
      healthCheck: { path: '/' }
    });
    
    listener.addTargets('Target2', {
      priority: 3,
      port: 80,
      targets: [service2],
      healthCheck: { path: '/api' },
      pathPattern: '/api'
    });
    

    listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');
    
    ///////////////////////////////////////////////////
    // Create DevOps Services for workshop-api-1
    ///////////////////////////////////////////////////
    
    const code1 = new codecommit.Repository(this, 'Repository1' ,{
      repositoryName: 'workshop-api-1',
      description: 'Workshop API 1.', // optional property
    });
    
    const project1 = new codebuild.PipelineProject(this, 'MyProject1',{
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        privileged: true
      },
    });
    const buildRolePolicy1 =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ]
    });
    project1.addToRolePolicy(buildRolePolicy1);
    
    const sourceOutput1 = new codepipeline.Artifact();
    const buildOutput1 = new codepipeline.Artifact();
    const sourceAction1 = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: code1,
      output: sourceOutput1,
    });
    const buildAction1 = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: project1,
      input: sourceOutput1,
      outputs: [buildOutput1],
    });

    new codepipeline.Pipeline(this, 'MyPipeline1', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction1],
        },
        {
          stageName: 'Build',
          actions: [buildAction1],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: "ECS-Service",
              service: service1, 
              input: buildOutput1
            }
            )
          ]
        }
      ],
    });
    
    ///////////////////////////////////////////////////
    // Create DevOps Services for workshop-api-2
    ///////////////////////////////////////////////////
    
    const code2 = new codecommit.Repository(this, 'Repository2' ,{
      repositoryName: 'workshop-api-2',
      description: 'Workshop API 2.', // optional property
    });
    
    const project2 = new codebuild.PipelineProject(this, 'MyProject2',{
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        privileged: true
      },
    });
    const buildRolePolicy2 =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ]
    });
    project2.addToRolePolicy(buildRolePolicy2);
    
    const sourceOutput2 = new codepipeline.Artifact();
    const buildOutput2 = new codepipeline.Artifact();
    const sourceAction2 = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: code2,
      output: sourceOutput2,
    });
    const buildAction2 = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: project2,
      input: sourceOutput2,
      outputs: [buildOutput2],
    });

    new codepipeline.Pipeline(this, 'MyPipeline2', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction2],
        },
        {
          stageName: 'Build',
          actions: [buildAction2],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: "ECS-Service",
              service: service2, 
              input: buildOutput2
            }
            )
          ]
        }
      ],
    });
    
  }
}
