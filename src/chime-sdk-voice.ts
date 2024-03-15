/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */
import { Duration, Stack } from 'aws-cdk-lib';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { CfnEIP } from 'aws-cdk-lib/aws-ec2';
import {
  ServicePrincipal,
  Role,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  ChimeSipMediaApp,
  ChimePhoneNumber,
  PhoneProductType,
  ChimeVoiceConnector,
  PhoneNumberType,
  PhoneCountry,
  ChimeSipRule,
  TriggerType,
  Protocol,
} from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';

interface SIPMediaApplicationProps {
  meetingTable: TableV2;
  callCountTable: TableV2;
  voiceConnector: ChimeVoiceConnector;
  externalNumber: string;
}

export interface PhoneNumberInfo {
  language: string;
  internalPhoneNumber: string;
}

export class SIPMediaApplication extends Construct {
  smaPhoneNumbers: Record<string, PhoneNumberInfo> = {};
  sipMediaApp: ChimeSipMediaApp;

  constructor(scope: Construct, id: string, props: SIPMediaApplicationProps) {
    super(scope, id);

    const phoneNumberLanguages = [
      // 'passthru',
      // 'german',
      // 'portuguese',
      // 'french',
      'spanish',
      // 'hindi',
    ];

    phoneNumberLanguages.forEach((language, index) => {
      const phoneNumber = new ChimePhoneNumber(this, `${language}PhoneNumber`, {
        phoneNumberType: PhoneNumberType.LOCAL,
        phoneCountry: PhoneCountry.US,
        phoneState: 'IL',
        phoneProductType: PhoneProductType.SMA,
      });
      this.smaPhoneNumbers[phoneNumber.phoneNumber] = {
        language: language,
        internalPhoneNumber: `555${index}`,
      };
    });

    const smaHandlerRole = new Role(this, 'smaHandlerRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: [
                'chime:DeleteMeeting',
                'chime:CreateMeetingWithAttendees',
              ],
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

    const smaHandlerLambda = new NodejsFunction(this, 'smaHandlerLambda', {
      entry: 'src/resources/smaHandler/index.ts',
      handler: 'lambdaHandler',
      runtime: Runtime.NODEJS_18_X,
      role: smaHandlerRole,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(60),
      environment: {
        LANGUAGE_NUMBERS: JSON.stringify(this.smaPhoneNumbers),
        MEETING_TABLE: props.meetingTable.tableName,
        CALL_COUNT_TABLE: props.callCountTable.tableName,
        EXTERNAL_NUMBER: props.externalNumber,
        VOICE_CONNECTOR_ARN: `arn:aws:chime:${Stack.of(this).region}:${
          Stack.of(this).account
        }:vc/${props.voiceConnector.voiceConnectorId}`,
      },
    });

    this.sipMediaApp = new ChimeSipMediaApp(this, 'sipMediaApp', {
      region: Stack.of(this).region,
      endpoint: smaHandlerLambda.functionArn,
    });

    Object.keys(this.smaPhoneNumbers).forEach((phoneNumber, index) => {
      const phoneNumberInfo = this.smaPhoneNumbers[phoneNumber];
      new ChimeSipRule(this, `SipRule${index}`, {
        triggerType: TriggerType.TO_PHONE_NUMBER,
        triggerValue: phoneNumber,
        name: `${phoneNumberInfo.language}Rule`,
        targetApplications: [
          {
            priority: 1,
            sipMediaApplicationId: this.sipMediaApp.sipMediaAppId,
          },
        ],
      });
    });

    props.meetingTable.grantReadWriteData(smaHandlerLambda);
    props.callCountTable.grantReadWriteData(smaHandlerLambda);
  }
}

interface VoiceConnectorResourceProps {
  asteriskEip: CfnEIP;
}

export class VoiceConnectorResources extends Construct {
  public readonly voiceConnector: ChimeVoiceConnector;
  public readonly phoneNumber: ChimePhoneNumber;

  constructor(
    scope: Construct,
    id: string,
    props: VoiceConnectorResourceProps,
  ) {
    super(scope, id);

    this.phoneNumber = new ChimePhoneNumber(this, 'voiceConnectorPhoneNumber', {
      phoneProductType: PhoneProductType.VC,
      phoneNumberType: PhoneNumberType.LOCAL,
      phoneCountry: PhoneCountry.US,
      phoneState: 'IL',
    });

    this.voiceConnector = new ChimeVoiceConnector(this, 'pstnVoiceConnector', {
      termination: {
        terminationCidrs: [`${props.asteriskEip.ref}/32`],
        callingRegions: ['US'],
      },
      origination: [
        {
          host: props.asteriskEip.ref,
          port: 5060,
          protocol: Protocol.UDP,
          priority: 1,
          weight: 1,
        },
      ],
      encryption: false,
    });

    this.phoneNumber.associateWithVoiceConnector(this.voiceConnector);
  }
}
