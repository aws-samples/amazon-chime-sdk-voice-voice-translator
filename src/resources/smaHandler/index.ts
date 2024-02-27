import {
  joinChimeMeetingSuccessfulHandler,
  callAndBridgeSuccessfulHandler,
  newInboundCallHandler,
  newOutboundCallHandler,
  speakSuccessfulHandler,
  speakInterruptedHandler,
  speakFailedHandler,
  callUpdateRequestResponseHandler,
  callAnsweredHandler,
  hangupHandler,
} from './eventHandlers';

import {
  ActionTypes,
  InvocationEventType,
  SchemaVersion,
  SipMediaApplicationEvent,
  SipMediaApplicationResponse,
  Actions,
  TransactionAttributes,
} from './sip-media-application';

export interface CallResponse {
  AttendeeType: string;
  Language: string;
  Text: string;
}

export interface TranslatorTransactionAttributes extends TransactionAttributes {
  MeetingId?: string;
  CallIdLegA?: string;
  CallIdLegB?: string;
  AttendeeId?: string;
  AttendeeType?: string;
  ToCallNumber?: string;
  ToCallLanguage?: string;
  CallResponse?: string;
  PreviousInterruption?: string;
}

export const lambdaHandler = async (
  event: SipMediaApplicationEvent,
): Promise<SipMediaApplicationResponse> => {
  console.log('Lambda is invoked with call details:' + JSON.stringify(event));
  let actions: Actions[] = [];
  let transactionAttributes: TranslatorTransactionAttributes = event.CallDetails
    .TransactionAttributes
    ? event.CallDetails.TransactionAttributes
    : {};

  switch (event.InvocationEventType) {
    case InvocationEventType.RINGING:
      console.log('RINGING');
      actions = [];
      break;
    case InvocationEventType.NEW_INBOUND_CALL:
      console.log('NEW_INBOUND_CALL');
      ({ actions, transactionAttributes } = await newInboundCallHandler(
        event,
        transactionAttributes,
      ));
      break;
    case InvocationEventType.NEW_OUTBOUND_CALL:
      console.log('NEW_OUTBOUND_CALL');
      ({ actions, transactionAttributes } = await newOutboundCallHandler(
        event,
        transactionAttributes,
      ));
      break;

    case InvocationEventType.ACTION_SUCCESSFUL:
      console.log('ACTION SUCCESSFUL');

      switch (event.ActionData!.Type) {
        case ActionTypes.CALL_AND_BRIDGE:
          console.log('CALL_AND_BRIDGE successful');
          ({ actions, transactionAttributes } =
            await callAndBridgeSuccessfulHandler(event, transactionAttributes));
          break;
        case ActionTypes.JOIN_CHIME_MEETING:
          console.log('JOIN_CHIME_MEETING successful');
          ({ actions, transactionAttributes } =
            await joinChimeMeetingSuccessfulHandler(
              event,
              transactionAttributes,
            ));
          break;
        case ActionTypes.SPEAK:
          console.log('SPEAK successful');
          ({ actions, transactionAttributes } = await speakSuccessfulHandler(
            event,
            transactionAttributes,
          ));
          break;
        default:
          break;
      }
      break;

    case InvocationEventType.ACTION_INTERRUPTED:
      console.log('ACTION_INTERRUPTED');
      switch (event.ActionData!.Type) {
        case ActionTypes.SPEAK:
          console.log('SPEAK interrupted');
          ({ actions, transactionAttributes } = await speakInterruptedHandler(
            event,
            transactionAttributes,
          ));
          break;
      }
      break;

    case InvocationEventType.ACTION_FAILED:
      console.log('ACTION_FAILED');
      switch (event.ActionData!.Type) {
        case ActionTypes.SPEAK:
          console.log('SPEAK failed');
          ({ actions, transactionAttributes } = await speakFailedHandler(
            event,
            transactionAttributes,
          ));
          break;
      }
      break;

    case InvocationEventType.CALL_UPDATE_REQUESTED:
      console.log('CALL_UPDATE_REQUESTED');
      switch (event.ActionData?.Parameters.Arguments.Function) {
        case 'Response':
          console.log('Response Case');
          ({ actions, transactionAttributes } =
            await callUpdateRequestResponseHandler(
              event,
              transactionAttributes,
            ));
          break;
        default:
          break;
      }
      break;

    case InvocationEventType.HANGUP:
      console.log('HANGUP');
      ({ actions, transactionAttributes } = await hangupHandler(
        event,
        transactionAttributes,
      ));
      break;
    case InvocationEventType.CALL_ANSWERED:
      console.log('CALL ANSWERED');
      ({ actions, transactionAttributes } = await callAnsweredHandler(
        event,
        transactionAttributes,
      ));
      break;
    default:
      console.log('FAILED ACTION');
      actions = [];
  }

  const response: SipMediaApplicationResponse = {
    SchemaVersion: SchemaVersion.VERSION_1_0,
    Actions: actions,
    TransactionAttributes: transactionAttributes,
  };

  console.log('Sending response:' + JSON.stringify(response));
  return response;
};
