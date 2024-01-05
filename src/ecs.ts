import { Stack } from 'aws-cdk-lib';
import { AdjustmentType } from 'aws-cdk-lib/aws-autoscaling';
import { IMetric } from 'aws-cdk-lib/aws-cloudwatch';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { SecurityGroup, Port, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  ContainerImage,
  CpuArchitecture,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  ManagedPolicy,
  Role,
  PolicyStatement,
  PolicyDocument,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { ChimeSipMediaApp } from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';
import { PhoneNumberInfo } from './chime-sdk-voice';

interface ECSResourcesProps {
  sipMediaApplication: ChimeSipMediaApp;
  meetingTable: TableV2;
  vpc: Vpc;
  kvsConsumerAlbSecurityGroup: SecurityGroup;
  callsPerTaskMetric: IMetric;
  languageNumbers: Record<string, PhoneNumberInfo>;
}

export class ECSResources extends Construct {
  fargateService: ApplicationLoadBalancedFargateService;
  constructor(scope: Construct, id: string, props: ECSResourcesProps) {
    super(scope, id);

    const kvsConsumerRole = new Role(this, 'kvsConsumerRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        ['BedrockPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['bedrock:InvokeModel'],
            }),
          ],
        }),
        ['ChimePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: [
                `arn:aws:chime:${Stack.of(this).region}:${
                  Stack.of(this).account
                }:sma/${props.sipMediaApplication.sipMediaAppId}`,
              ],
              actions: ['chime:UpdateSipMediaApplicationCall'],
            }),
          ],
        }),
        ['KinesisVideoPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: [
                'kinesisvideo:GetDataEndpoint',
                'kinesisvideo:GetMedia',
              ],
            }),
          ],
        }),
        ['TranscribePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['transcribe:StartStreamTranscription'],
            }),
          ],
        }),
        ['TranslatePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['translate:TranslateText'],
            }),
          ],
        }),
        ['DynamoDBPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: [props.meetingTable.tableArn],
              actions: ['*'],
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

    const alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      internetFacing: false,
      securityGroup: props.kvsConsumerAlbSecurityGroup,
    });

    this.fargateService = new ApplicationLoadBalancedFargateService(
      this,
      'fargateService',
      {
        taskImageOptions: {
          image: ContainerImage.fromAsset('src/resources/kvsConsumer'),
          taskRole: kvsConsumerRole,
          environment: {
            SIP_MEDIA_APPLICATION_ID: props.sipMediaApplication.sipMediaAppId,
            MEETING_TABLE: props.meetingTable.tableName,
            REGION: Stack.of(this).region,
            LANGUAGE_NUMBERS: JSON.stringify(props.languageNumbers),
          },
        },
        publicLoadBalancer: true,
        cpu: 2048,
        memoryLimitMiB: 4096,
        vpc: props.vpc,
        assignPublicIp: false,
        openListener: false,
        loadBalancer: alb,
        listenerPort: 80,
        taskSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        securityGroups: [props.kvsConsumerAlbSecurityGroup],
        runtimePlatform: {
          operatingSystemFamily: OperatingSystemFamily.LINUX,
          cpuArchitecture: CpuArchitecture.ARM64,
        },
      },
    );

    const scalableTarget = this.fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    scalableTarget.scaleOnMetric('ScaleOnCallsPerTask', {
      metric: props.callsPerTaskMetric,
      scalingSteps: [
        { upper: 10, change: -1 },
        { lower: 20, change: +1 },
        { lower: 50, change: +3 },
      ],
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY,
    });

    this.fargateService.service.connections.allowFrom(
      props.kvsConsumerAlbSecurityGroup,
      Port.tcp(80),
    );
  }
}
