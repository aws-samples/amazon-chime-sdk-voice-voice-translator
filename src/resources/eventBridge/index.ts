/* eslint-disable import/no-extraneous-dependencies */
import {
  ChimeSDKMediaPipelinesClient,
  CreateMediaStreamPipelineCommand,
  MediaPipelineSourceType,
  MediaStreamPipelineSinkType,
  MediaStreamType,
} from '@aws-sdk/client-chime-sdk-media-pipelines';
import {
  CreateAttendeeCommand,
  ChimeSDKMeetingsClient,
} from '@aws-sdk/client-chime-sdk-meetings';
import {
  CreateSipMediaApplicationCallCommand,
  ChimeSDKVoiceClient,
} from '@aws-sdk/client-chime-sdk-voice';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

import { Handler } from 'aws-cdk-lib/aws-lambda';
import axios from 'axios';
import {
  MeetingEventType,
  MediaStreamPipelineEventType,
  MeetingEventDetails,
  EventBridge,
  DetailType,
} from './types';

interface ConsumerInfo {
  startFragmentNumber: string;
  meetingId: string;
  attendeeId: string;
  callStreamingStartTime: string;
  callerStreamArn: string;
}

const KINESIS_VIDEO_STREAM_POOL_ARN = process.env.KINESIS_VIDEO_STREAM_POOL_ARN;
const SIP_MEDIA_APPLICATION_ID = process.env.SIP_MEDIA_APPLICATION_ID;
const SMA_PHONE_NUMBER = process.env.SMA_PHONE_NUMBER;
const KVS_CONSUMER_URL = process.env.KVS_CONSUMER_URL || '';
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCOUNT = process.env.AWS_ACCOUNT;
const MEETING_TABLE = process.env.MEETING_TABLE || '';

const ddbClient = new DynamoDBClient({ region: AWS_REGION });

const chimeSdkMediaPipelinesClient = new ChimeSDKMediaPipelinesClient({
  region: AWS_REGION,
});

const chimeSdkVoiceClient = new ChimeSDKVoiceClient({ region: AWS_REGION });

const chimeSdkMeetingsClient = new ChimeSDKMeetingsClient({
  region: AWS_REGION,
});

export const handler: Handler = async (event: EventBridge): Promise<null> => {
  console.info(JSON.stringify(event, null, 2));

  switch (event['detail-type']) {
    case DetailType.CHIME_MEETING_STATE_CHANGE:
      switch (event.detail.eventType) {
        case MeetingEventType.MeetingStarted:
          console.log('Meeting Started');
          if (event.detail.externalMeetingId === 'VoiceVoiceTranslator') {
            await startMediaStreamPipeline(event.detail);
          }
          break;
        case MeetingEventType.AttendeeDropped:
          console.log('Attendee Dropped');
          break;
        case MeetingEventType.AttendeeLeft:
          console.log('Attendee Left');
          break;
        case MeetingEventType.AttendeeJoined:
          console.log('Attendee Joined');
          if (
            event.detail.externalUserId &&
            event.detail.externalUserId == 'InboundCallAttendee'
          ) {
            console.log('Inbound Call Attendee Joined');
            const attendeeInfo = await createAttendee(event.detail.meetingId);
            await startOutboundCall(
              event.detail.meetingId,
              attendeeInfo.Attendee!.JoinToken!,
              attendeeInfo.Attendee!.AttendeeId!,
            );
          }
          break;
        default:
          break;
      }
      break;
    case DetailType.CHIME_MEDIA_PIPELINE_STATE_CHANGE:
      switch (event.detail.eventType) {
        case MediaStreamPipelineEventType.MediaPipelineKinesisVideoStreamStart:
          console.log('MediaPipelineKinesisVideoStreamStart');
          const consumerInfo = {
            startFragmentNumber: event.detail.startFragmentNumber,
            meetingId: event.detail.meetingId,
            attendeeId: event.detail.attendeeId,
            callStreamingStartTime: event.detail.startTime,
            callerStreamArn: event.detail.kinesisVideoStreamArn,
            externalUserId: event.detail.externalUserId,
          };
          await startConsumer(consumerInfo);
          break;
        case MediaStreamPipelineEventType.MediaPipelineKinesisVideoStreamEnd:
          console.log('MediaPipelineKinesisVideoStreamEnd');
          break;
      }
      break;
    case DetailType.CHIME_MEDIA_PIPELINE_KINESIS_VIDEO_POOL_STATE_CHANGE:
      break;
  }
  return null;
};

async function startMediaStreamPipeline(eventDetail: MeetingEventDetails) {
  try {
    const params = {
      Sinks: [
        {
          MediaStreamType: MediaStreamType.IndividualAudio,
          ReservedStreamCapacity: 2,
          SinkArn: KINESIS_VIDEO_STREAM_POOL_ARN,
          SinkType: MediaStreamPipelineSinkType.KinesisVideoStreamPool,
        },
      ],
      Sources: [
        {
          SourceArn: `arn:aws:chime:${AWS_REGION}:${AWS_ACCOUNT}:meeting/${eventDetail.meetingId}`,
          SourceType: MediaPipelineSourceType.ChimeSdkMeeting,
        },
      ],
    };
    console.log(
      `CreateMediaStreamPipeline Params: ${JSON.stringify(params, null, 2)}`,
    );
    await chimeSdkMediaPipelinesClient.send(
      new CreateMediaStreamPipelineCommand(params),
    );
  } catch (error) {
    throw new Error(`Error starting Streaming Pipeline: ${error}`);
  }
}

async function startConsumer(consumerInfo: ConsumerInfo) {
  console.log('Starting Consumer');
  try {
    const response = await axios.post(
      `http://${KVS_CONSUMER_URL}/call`,
      consumerInfo,
    );
    console.log('POST request response:', response.data);
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

const startOutboundCall = async (
  meetingId: string,
  joinToken: string,
  attendeeId: string,
) => {
  console.log(
    `Starting Outbound Call for meetingId ${meetingId} with joinToken ${joinToken}`,
  );
  const databaseResponse = await readMeetingInfoFromDB(meetingId);

  let toCallNumber: string = '';
  let toCallLanguage: string = '';

  if (databaseResponse) {
    toCallNumber = databaseResponse[0].toCallNumber!.S!;
    toCallLanguage = databaseResponse[0].toCallLanguage!.S!;
  }

  try {
    const response = await chimeSdkVoiceClient.send(
      new CreateSipMediaApplicationCallCommand({
        SipMediaApplicationId: SIP_MEDIA_APPLICATION_ID,
        FromPhoneNumber: SMA_PHONE_NUMBER,
        ToPhoneNumber: '+17035550122',
        SipHeaders: {
          'X-chime-join-token': joinToken,
          'X-chime-meeting-id': meetingId,
        },
        ArgumentsMap: {
          AttendeeId: attendeeId,
          MeetingId: meetingId,
          ToCallNumber: toCallNumber,
          ToCallLanguage: toCallLanguage,
        },
      }),
    );
    console.log('Outbound Call Response:', response);
    return response;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

const createAttendee = async (meetingId: string) => {
  console.log('Creating Attendee');
  try {
    const response = await chimeSdkMeetingsClient.send(
      new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: 'OutboundCallAttendee',
      }),
    );
    console.log('Create Attendee Response:', response);
    return response;
  } catch (error) {
    console.log('Error: ', error);
    throw error;
  }
};

async function readMeetingInfoFromDB(meetingId: string) {
  const params = {
    TableName: MEETING_TABLE,
    KeyConditionExpression: 'meetingId = :id',
    ExpressionAttributeValues: {
      ':id': { S: meetingId },
    },
  };

  try {
    const data = await ddbClient.send(new QueryCommand(params));
    if (data.Items) {
      console.log(
        `Retrieved meeting info for meetingId: ${meetingId}: ${JSON.stringify(
          data.Items,
        )}`,
      );
      return data.Items;
    } else {
      console.log(
        `${externalUserId}: No meeting found for meetingId: ${meetingId}`,
      );
      return null;
    }
  } catch (error) {
    console.error(`Error reading from DB: ${error}`);
    throw error;
  }
}
