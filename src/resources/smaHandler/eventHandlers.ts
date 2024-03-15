import {
  speakAction,
  sipCallAndBridgeAction,
  pstnCallAndBridgeAction,
  joinChimeMeetingAction,
  hangupAction,
} from './actions';

import { TranslatorTransactionAttributes, CallResponse } from './index';
import {
  SipMediaApplicationEvent,
  Actions,
  PollyLanguageCodes,
} from './sip-media-application';

import {
  createMeeting,
  deleteMeeting,
  writeMeetingInfoToDB,
  updateCallCount,
  convertLanguageToISOCode,
  determineCallLeg,
  handleExistingResponse,
  handleNewResponse,
  setCallId,
  processCallResponse,
} from './utils';

const LANGUAGE_NUMBERS = process.env.LANGUAGE_NUMBERS;
const EXTERNAL_NUMBER = process.env.EXTERNAL_NUMBER || '';

export async function newInboundCallHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];

  const meetingInfo = await createMeeting();
  const phoneNumberMap = JSON.parse(LANGUAGE_NUMBERS!);
  const phoneNumberInfo = phoneNumberMap[event.CallDetails.Participants[0].To];

  await writeMeetingInfoToDB(
    meetingInfo.Meeting!.MeetingId!,
    'InboundCallAttendee',
    meetingInfo.Attendees![0].AttendeeId!,
    event.CallDetails.TransactionId,
    'en-US',
    event.CallDetails.Participants[0].To,
    phoneNumberInfo.language,
    phoneNumberInfo.internalPhoneNumber,
  );
  await updateCallCount(1);
  transactionAttributes.MeetingId = meetingInfo!.Meeting!.MeetingId!;
  transactionAttributes.AttendeeType = 'InboundCallAttendee';
  actions = [
    joinChimeMeetingAction(
      meetingInfo,
      event.CallDetails.Participants[0].CallId,
    ),
  ];
  return { actions, transactionAttributes };
}

export async function newOutboundCallHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];

  transactionAttributes.AttendeeId =
    event.ActionData?.Parameters.Arguments.AttendeeId || '';
  transactionAttributes.MeetingId =
    event.ActionData?.Parameters.Arguments.MeetingId || '';
  transactionAttributes.ToCallNumber =
    event.ActionData?.Parameters.Arguments.ToCallNumber || '';
  transactionAttributes.ToCallLanguage =
    event.ActionData?.Parameters.Arguments.ToCallLanguage || '';
  transactionAttributes.AttendeeType = 'OutboundCallAttendee';
  return { actions, transactionAttributes };
}

export async function hangupHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];

  if (event.ActionData?.Parameters.ParticipantTag === 'LEG-A') {
    console.log('Hangup from Leg A - Hangup Leg B');

    if (transactionAttributes.AttendeeType == 'InboundCallAttendee') {
      console.log('Hangup from Inbound Call');
      actions = [hangupAction(transactionAttributes.CallIdLegB!)];

      await deleteMeeting(transactionAttributes.MeetingId!);
      await updateCallCount(-1);
    } else {
      actions = [];
    }
  } else {
    console.log('Hangup from Leg B - Hangup Leg A');
    actions = [hangupAction(transactionAttributes.CallIdLegA!)];
    await deleteMeeting(transactionAttributes.MeetingId!);
  }
  return { actions, transactionAttributes };
}

export async function joinChimeMeetingSuccessfulHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  ({ transactionAttributes } = setCallId(event, transactionAttributes));
  actions = [
    speakAction(
      'Connecting you to your party.  Conversation may be delayed as translations occur.',
      PollyLanguageCodes.EN_US,
      transactionAttributes.CallIdLegA!,
    ),
  ];
  return { actions, transactionAttributes };
}

export async function callAndBridgeSuccessfulHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  ({ transactionAttributes } = setCallId(event, transactionAttributes));
  actions = [];
  return { actions, transactionAttributes };
}

export async function speakSuccessfulHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  ({ transactionAttributes } = setCallId(event, transactionAttributes));
  const callLeg = determineCallLeg(transactionAttributes);
  ({ transactionAttributes, actions } = processCallResponse(
    transactionAttributes,
    actions,
    callLeg,
  ));

  return { actions, transactionAttributes };
}

export async function speakInterruptedHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  ({ transactionAttributes } = setCallId(event, transactionAttributes));
  const callLeg = determineCallLeg(transactionAttributes);
  ({ transactionAttributes, actions } = processCallResponse(
    transactionAttributes,
    actions,
    callLeg,
  ));

  return { actions, transactionAttributes };
}

export async function speakFailedHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  ({ transactionAttributes } = setCallId(event, transactionAttributes));
  const callLeg = determineCallLeg(transactionAttributes);
  ({ transactionAttributes, actions } = processCallResponse(
    transactionAttributes,
    actions,
    callLeg,
  ));

  return { actions, transactionAttributes };
}

export async function callUpdateRequestResponseHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  const callLeg = determineCallLeg(transactionAttributes);
  const existingCallResponse: CallResponse[] =
    transactionAttributes.CallResponse
      ? (JSON.parse(transactionAttributes.CallResponse) as CallResponse[])
      : [];

  if (existingCallResponse.length > 0) {
    ({ transactionAttributes, actions } = handleExistingResponse(
      event,
      transactionAttributes,
      existingCallResponse,
      callLeg,
      actions,
    ));
  } else {
    ({ transactionAttributes, actions } = handleNewResponse(
      event,
      transactionAttributes,
      callLeg,
      actions,
    ));
  }

  return { actions, transactionAttributes };
}

export async function callAnsweredHandler(
  event: SipMediaApplicationEvent,
  transactionAttributes: TranslatorTransactionAttributes,
) {
  let actions: Actions[] = [];
  await writeMeetingInfoToDB(
    transactionAttributes.MeetingId!,
    'OutboundCallAttendee',
    transactionAttributes.AttendeeId!,
    event.CallDetails.TransactionId,
    convertLanguageToISOCode(transactionAttributes.ToCallLanguage!),
  );
  if (EXTERNAL_NUMBER) {
    actions = [
      pstnCallAndBridgeAction(
        event.CallDetails.Participants[0].From,
        EXTERNAL_NUMBER,
      ),
    ];
  } else {
    actions = [
      sipCallAndBridgeAction(
        '+18005551212',
        transactionAttributes.ToCallNumber!,
      ),
    ];
  }
  return { actions, transactionAttributes };
}
