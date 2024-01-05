/* eslint-disable import/no-extraneous-dependencies */
import { App, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from 'dotenv';
import {
  KinesisVideoStreamPoolResources,
  EventBridgeResources,
  SIPMediaApplication,
  VoiceConnectorResources,
  DatabaseResources,
  ECSResources,
  VPCResources,
  CloudWatchResources,
  DistributionResources,
  ServerResources,
  CognitoResources,
} from './index';

config();

export interface AmazonChimeSDKVoiceVoiceTranslatorProps extends StackProps {
  logLevel: string;
  sshPubKey: string;
  allowedDomain?: string;
}

export class AmazonChimeSDKVoiceVoiceTranslator extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: AmazonChimeSDKVoiceVoiceTranslatorProps,
  ) {
    super(scope, id, props);

    const kinesisVideoPoolStreamResources = new KinesisVideoStreamPoolResources(
      this,
      'KinesisVideoStreamPoolResources',
    );

    const cloudWatchResources = new CloudWatchResources(
      this,
      'cloudWatchResources',
    );

    const databaseResources = new DatabaseResources(this, 'databaseResources');

    const vpcResources = new VPCResources(this, 'vpcResources');

    const voiceConnectorResources = new VoiceConnectorResources(
      this,
      'VoiceConnector',
      {
        asteriskEip: vpcResources.serverEip,
      },
    );

    const cognitoResources = new CognitoResources(this, 'Cognito', {
      allowedDomain: props.allowedDomain || '',
    });

    const distributionResources = new DistributionResources(
      this,
      'DistributionResources',
      {
        clientApplicationLoadBalancer:
          vpcResources.clientApplicationLoadBalancer,
      },
    );

    const sipMediaApplication = new SIPMediaApplication(
      this,
      'sipMediaApplication',
      {
        meetingTable: databaseResources.meetingTable,
        callCountTable: databaseResources.callCountTable,
        voiceConnector: voiceConnectorResources.voiceConnector,
      },
    );

    const kvsConsumer = new ECSResources(this, 'kvsConsumer', {
      sipMediaApplication: sipMediaApplication.sipMediaApp,
      meetingTable: databaseResources.meetingTable,
      vpc: vpcResources.vpc,
      kvsConsumerAlbSecurityGroup: vpcResources.kvsConsumerAlbSecurityGroup,
      callsPerTaskMetric: cloudWatchResources.callsPerTaskMetric,
      languageNumbers: sipMediaApplication.smaPhoneNumbers,
    });

    new EventBridgeResources(this, 'eventBridgeResources', {
      kinesisVideoStreamPool:
        kinesisVideoPoolStreamResources.kinesisVideoStreamPool,
      kvsConsumer: kvsConsumer.fargateService,
      meetingTable: databaseResources.meetingTable,
      vpc: vpcResources.vpc,
      kvsConsumerAlbSecurityGroup: vpcResources.kvsConsumerAlbSecurityGroup,
      callCountTable: databaseResources.callCountTable,
      fargateCluster: kvsConsumer.fargateService.cluster,
      sipMediaApplication: sipMediaApplication.sipMediaApp,
      smaPhoneNumber: Object.keys(sipMediaApplication.smaPhoneNumbers)[0],
      languageNumbers: sipMediaApplication.smaPhoneNumbers,
    });

    const serverResources = new ServerResources(this, 'Asterisk', {
      serverEip: vpcResources.serverEip,
      voiceConnector: voiceConnectorResources.voiceConnector,
      vpc: vpcResources.vpc,
      voiceSecurityGroup: vpcResources.voiceSecurityGroup,
      clientAlbSecurityGroup: vpcResources.clientAlbSecurityGroup,
      sshSecurityGroup: vpcResources.sshSecurityGroup,
      logLevel: props.logLevel,
      sshPubKey: props.sshPubKey,
      clientApplicationLoadBalancer: vpcResources.clientApplicationLoadBalancer,
      distribution: distributionResources.distribution,
      userPool: cognitoResources.userPool,
      userPoolClient: cognitoResources.userPoolClient,
      userPoolRegion: cognitoResources.userPoolRegion,
      identityPool: cognitoResources.identityPool,
    });

    Object.keys(sipMediaApplication.smaPhoneNumbers).forEach(
      (externalPhoneNumber) => {
        const phoneNumberInfo =
          sipMediaApplication.smaPhoneNumbers[externalPhoneNumber];

        new CfnOutput(this, `${phoneNumberInfo.language} PhoneNumber`, {
          value: externalPhoneNumber,
        });
      },
    );

    new CfnOutput(this, 'AsteriskServerClient', {
      value: `https://${distributionResources.distribution.domainName}/`,
    });

    new CfnOutput(this, 'ssmCommand', {
      value: `aws ssm start-session --target ${serverResources.instanceId}`,
    });

    new CfnOutput(this, 'sshCommand', {
      value: `ssh ubuntu@${vpcResources.serverEip.ref}`,
    });
  }
}

const props = {
  logLevel: process.env.LOG_LEVEL || '',
  allowedDomain: process.env.ALLOWED_DOMAIN || '',
  sshPubKey: process.env.SSH_PUB_KEY || ' ',
};
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new AmazonChimeSDKVoiceVoiceTranslator(
  app,
  'AmazonChimeSDKVoiceVoiceTranslator',
  {
    ...props,
    env: devEnv,
  },
);

app.synth();
