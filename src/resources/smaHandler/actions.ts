import { CreateMeetingWithAttendeesCommandOutput } from '@aws-sdk/client-chime-sdk-meetings';
import {
  ActionTypes,
  PollyLanguageCodes,
  Engine,
  TextType,
  PollyVoiceIds,
  CallAndBridgeActionParameters,
  BridgeEndpointType,
} from './sip-media-application';

const VOICE_CONNECTOR_ARN = process.env.VOICE_CONNECTOR_ARN;

export function hangupAction(callId: string) {
  return {
    Type: ActionTypes.HANGUP,
    Parameters: {
      SipResponseCode: '0',
      CallId: callId,
    },
  };
}

export function speakAction(
  text: string,
  language: PollyLanguageCodes,
  callId: string,
) {
  let voiceID: PollyVoiceIds = PollyVoiceIds.JOANNA;
  switch (language) {
    case PollyLanguageCodes.DE_DE:
      voiceID = PollyVoiceIds.VICKI;
      break;
    case PollyLanguageCodes.EN_US:
      voiceID = PollyVoiceIds.JOANNA;
      break;
    case PollyLanguageCodes.HI_IN:
      voiceID = PollyVoiceIds.KAJAL;
      break;
    case PollyLanguageCodes.PT_BR:
      voiceID = PollyVoiceIds.CAMILA;
      break;
    case PollyLanguageCodes.ES_US:
      voiceID = PollyVoiceIds.LUPE;
      break;
    case PollyLanguageCodes.FR_FR:
      voiceID = PollyVoiceIds.LEA;
      break;
    default:
      break;
  }

  return {
    Type: ActionTypes.SPEAK,
    Parameters: {
      Text: text,
      CallId: callId,
      Engine: Engine.NEURAL,
      LanguageCode: language,
      TextType: TextType.TEXT,
      VoiceId: voiceID,
    },
  };
}

export function joinChimeMeetingAction(
  meetingInfo: CreateMeetingWithAttendeesCommandOutput,
  callId: string,
) {
  return {
    Type: ActionTypes.JOIN_CHIME_MEETING,
    Parameters: {
      JoinToken: meetingInfo.Attendees![0].JoinToken!,
      CallId: callId,
      MeetingId: meetingInfo.Meeting!.MeetingId!,
    },
  };
}

export function callAndBridgeAction(
  callingNumber: string,
  toCallNumber: string,
) {
  return {
    Type: ActionTypes.CALL_AND_BRIDGE,
    Parameters: {
      CallTimeoutSeconds: 30,
      CallerIdNumber: callingNumber,
      Endpoints: [
        {
          BridgeEndpointType: BridgeEndpointType.AWS,
          Arn: VOICE_CONNECTOR_ARN!,
          Uri: toCallNumber,
        },
      ],
    } as CallAndBridgeActionParameters,
  };
}
