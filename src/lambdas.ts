/* eslint-disable import/no-extraneous-dependencies */
import { Stack, Duration } from 'aws-cdk-lib';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import {
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
  Connections,
} from 'aws-cdk-lib/aws-ec2';
import { ICluster } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  ManagedPolicy,
  Role,
  PolicyStatement,
  PolicyDocument,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  KinesisVideoStreamPool,
  ChimeSipMediaApp,
} from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';
import { PhoneNumberInfo } from './chime-sdk-voice';

interface EventBridgeResourcesProps {
  kinesisVideoStreamPool: KinesisVideoStreamPool;
  kvsConsumer: ApplicationLoadBalancedFargateService;
  meetingTable: TableV2;
  vpc: Vpc;
  kvsConsumerAlbSecurityGroup: SecurityGroup;
  callCountTable: TableV2;
  fargateCluster: ICluster;
  sipMediaApplication: ChimeSipMediaApp;
  smaPhoneNumber: string;
  languageNumbers: Record<string, PhoneNumberInfo>;
}

export class EventBridgeResources extends Construct {
  constructor(scope: Construct, id: string, props: EventBridgeResourcesProps) {
    super(scope, id);

    const eventBridgeRole = new Role(this, 'eventBridgeRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: [
                'chime:CreateMediaStreamPipeline',
                'chime:CreateSipMediaApplicationCall',
                'chime:CreateAttendee',
              ],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole',
        ),
      ],
    });

    const lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
    });

    lambdaSecurityGroup.addEgressRule(
      props.kvsConsumerAlbSecurityGroup,
      Port.tcp(80),
    );

    props.kvsConsumerAlbSecurityGroup.connections.allowFrom(
      new Connections({
        securityGroups: [lambdaSecurityGroup],
      }),
      Port.tcp(80),
      'allow traffic on port 80 from the Lambda security group',
    );
    const eventBridgeLambda = new NodejsFunction(this, 'eventBridge', {
      entry: 'src/resources/eventBridge/index.ts',
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      role: eventBridgeRole,
      timeout: Duration.seconds(60),
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        KINESIS_VIDEO_STREAM_POOL_ARN: props.kinesisVideoStreamPool.poolArn,
        SIP_MEDIA_APPLICATION_ID: props.sipMediaApplication.sipMediaAppId,
        SMA_PHONE_NUMBER: props.smaPhoneNumber,
        AWS_ACCOUNT: Stack.of(this).account,
        KVS_CONSUMER_URL: props.kvsConsumer.loadBalancer.loadBalancerDnsName,
        MEETING_TABLE: props.meetingTable.tableName,
        LANGUAGE_NUMBERS: JSON.stringify(props.languageNumbers),
      },
    });
    const chimeSDKRule = new Rule(this, 'chimeSDKRule', {
      eventPattern: {
        source: ['aws.chime'],
        detailType: [
          'Chime Meeting State Change',
          'Chime Media Pipeline State Change',
          'Chime Media Pipeline Kinesis Video Pool State Change',
        ],
      },
    });
    chimeSDKRule.addTarget(new LambdaFunction(eventBridgeLambda));
    props.meetingTable.grantReadWriteData(eventBridgeLambda);

    const callCountScheduleRole = new Role(this, 'callCountScheduleRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['cloudwatchPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['cloudwatch:PutMetricData'],
            }),
          ],
        }),
        ['ecsPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['ecs:DescribeClusters'],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const callCountMetricLambda = new NodejsFunction(
      this,
      'callCountScheduleLambda',
      {
        entry: 'src/resources/callCountMetric/index.ts',
        runtime: Runtime.NODEJS_LATEST,
        architecture: Architecture.ARM_64,
        role: callCountScheduleRole,
        timeout: Duration.seconds(60),
        environment: {
          CALL_COUNT_TABLE: props.callCountTable.tableName,
          FARGATE_CLUSTER: props.fargateCluster.clusterName,
        },
      },
    );

    props.callCountTable.grantReadWriteData(callCountMetricLambda);

    new Rule(this, 'CallCountRule', {
      schedule: Schedule.rate(Duration.minutes(1)),
      targets: [new LambdaFunction(callCountMetricLambda)],
    });
  }
}
