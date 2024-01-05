/* eslint-disable @typescript-eslint/indent */

export enum MeetingEventType {
  AttendeeContentVideoStopped = 'chime:AttendeeContentVideoStopped',
  AttendeeContentDropped = 'chime:AttendeeContentDropped',
  AttendeeContentLeft = 'chime:AttendeeContentLeft',
  AttendeeContentJoined = 'chime:AttendeeContentJoined',
  AttendeeVideoStopped = 'chime:AttendeeVideoStopped',
  AttendeeVideoStarted = 'chime:AttendeeVideoStarted',
  AttendeeDropped = 'chime:AttendeeDropped',
  AttendeeLeft = 'chime:AttendeeLeft',
  AttendeeJoined = 'chime:AttendeeJoined',
  AttendeeAuthorized = 'chime:AttendeeAuthorized',
  AttendeeDeleted = 'chime:AttendeeDeleted',
  AttendeeAdded = 'chime:AttendeeAdded',
  MeetingEnded = 'chime:MeetingEnded',
  MeetingStarted = 'chime:MeetingStarted',
}
export enum MediaStreamPipelineEventType {
  MediaPipelineKinesisVideoStreamStart = 'chime:MediaPipelineKinesisVideoStreamStart',
  MediaPipelineKinesisVideoStreamEnd = 'chime:MediaPipelineKinesisVideoStreamEnd',
  MediaPipelineInProgress = 'chime:MediaPipelineInProgress',
  MediaPipelineDeleted = 'chime:MediaPipelineDeleted',
  MediaPipelineTemporaryFailure = 'chime:MediaPipelineTemporaryFailure',
  MediaPipelineResumed = 'chime:MediaPipelineResumed',
  MediaPipelinePermanentFailure = 'chime:MediaPipelinePermanentFailure',
}

export enum MediaPipelineKinesisVideoPoolEventType {
  MediaPipelineKinesisVideoStreamPoolActive = 'chime:MediaPipelineKinesisVideoStreamPoolActive',
  MediaPipelineKinesisVideoStreamPoolUpdated = 'chime:MediaPipelineKinesisVideoStreamPoolUpdated',
  MediaPipelineKinesisVideoStreamPoolDeleted = 'chime:MediaPipelineKinesisVideoStreamPoolDeleted',
  MediaPipelineKinesisVideoStreamPoolTemporaryFailure = 'chime:MediaPipelineKinesisVideoStreamPoolTemporaryFailure',
  MediaPipelineKinesisVideoStreamPoolPermanentFailure = 'chime:MediaPipelineKinesisVideoStreamPoolPermanentFailure',
}

export enum DetailType {
  CHIME_MEETING_STATE_CHANGE = 'Chime Meeting State Change',
  CHIME_MEDIA_PIPELINE_STATE_CHANGE = 'Chime Media Pipeline State Change',
  CHIME_MEDIA_PIPELINE_KINESIS_VIDEO_POOL_STATE_CHANGE = 'Chime Media Pipeline Kinesis Video Pool State Change',
}

export interface MeetingEventDetails {
  version: string;
  eventType: MeetingEventType;
  timestamp: number;
  meetingId: string;
  attendeeId?: string;
  externalUserId?: string;
  externalMeetingId: string;
  mediaRegion: string;
}

export interface MediaPipelineKinesisVideoPoolEventDetail {
  eventType: MediaPipelineKinesisVideoPoolEventType;
  timestamp: number;
  mediaRegion: string;
  poolArn: string;
}

export interface MediaStreamPipelineEventDetail {
  eventType: MediaStreamPipelineEventType;
  timestamp: number;
  meetingId: string;
  externalMeetingId: string;
  mediaPipelineId: string;
  mediaRegion: string;
  attendeeId: string;
  externalUserId: string;
  kinesisVideoStreamArn: string;
  startFragmentNumber: string;
  startTime: string;
}

export interface EventBridge {
  'version': '0';
  'id': string;
  'detail-type': DetailType;
  'source': 'aws.chime';
  'account': string;
  'time': string;
  'region': string;
  'resources': [];
  'detail':
    | MeetingEventDetails
    | MediaStreamPipelineEventDetail
    | MediaPipelineKinesisVideoPoolEventDetail;
}
